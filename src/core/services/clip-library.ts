/**
 * The editor's "Add clips" library: every finished video the creator owns, from storyboards and
 * from shot takes. Pure helpers, so the rules can be tested without a database.
 */

export type LibraryClip = { url: string; title: string; durationMs: number; source: string; projectId: string };

export type LibraryStoryboardRow = { url: string | null; duration_seconds: number | null; subject: string | null; project_id: string; created_at: string };
export type LibraryTakeRow = { output_url: string | null; status: string; duration_seconds: number | null; take_number: number | null; created_at: string; parameters?: unknown };
export type LibraryShotRow = { name: string | null; scene_id: string; shot_generations?: LibraryTakeRow[] | null };

const VIDEO_PATH = /\.(mp4|mov|webm|m4v)$/i;

/**
 * Scene Studio keeps its still images as takes too, so a finished take is only a clip when it is a
 * video: its own output type says so, or (for older rows without one) its file is a video.
 */
export function isVideoTake(take: Pick<LibraryTakeRow, 'output_url' | 'parameters'>): boolean {
  const url = take.output_url;
  if (!url || url === 'pending_generation') return false;
  const params = take.parameters && typeof take.parameters === 'object' ? (take.parameters as Record<string, unknown>) : null;
  const declared = typeof params?.output_type === 'string' ? params.output_type : null;
  if (declared) return declared === 'video';
  try {
    const u = new URL(url, 'https://local.invalid');
    return VIDEO_PATH.test(u.pathname) || (u.host === 'tempfile.aiquickdraw.com' && u.pathname.startsWith('/p/'));
  } catch {
    return false;
  }
}

/** Newest first, one entry per file, only finished videos. */
export function buildClipLibrary(input: {
  projectName: Map<string, string>;
  storyboard: LibraryStoryboardRow[];
  sceneProject: Map<string, string>;
  shots: LibraryShotRow[];
}): LibraryClip[] {
  const clips: (LibraryClip & { at: string })[] = [];
  for (const item of input.storyboard) {
    if (!item.url || !input.projectName.has(item.project_id)) continue;
    clips.push({
      url: item.url,
      title: item.subject || 'Storyboard shot',
      durationMs: Math.max(1, item.duration_seconds || 5) * 1000,
      source: input.projectName.get(item.project_id) || 'Storyboard',
      projectId: item.project_id,
      at: item.created_at,
    });
  }
  for (const shot of input.shots) {
    const projectId = input.sceneProject.get(shot.scene_id);
    if (!projectId || !input.projectName.has(projectId)) continue;
    for (const take of shot.shot_generations || []) {
      if (take.status !== 'completed' || !isVideoTake(take)) continue;
      clips.push({
        url: take.output_url!,
        title: `${shot.name || 'Shot'}${take.take_number ? ` · take ${take.take_number}` : ''}`,
        durationMs: Math.max(1, take.duration_seconds || 5) * 1000,
        source: input.projectName.get(projectId) || 'Film',
        projectId,
        at: take.created_at,
      });
    }
  }
  const seen = new Set<string>();
  return clips
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .map(({ url, title, durationMs, source, projectId }) => ({ url, title, durationMs, source, projectId }));
}

export type ClipSource = 'this' | 'other' | 'all';

/** Open on this project's clips when it has any; otherwise show everything, so the list is never empty by accident. */
export function defaultClipSource(clips: Pick<LibraryClip, 'projectId'>[], projectId: string): ClipSource {
  return clips.some((c) => c.projectId === projectId) ? 'this' : 'all';
}

export function filterClips<T extends Pick<LibraryClip, 'projectId'>>(clips: T[], source: ClipSource, projectId: string): T[] {
  return clips.filter((c) => source === 'all' || (source === 'this' ? c.projectId === projectId : c.projectId !== projectId));
}
