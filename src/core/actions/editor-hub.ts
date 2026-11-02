'use server';

import { createClient } from '@/infrastructure/supabase/server';
import { canCreateProject } from '@/core/services/billing';

export type EditableWork = {
  projectId: string;
  title: string;
  kind: 'film' | 'storyboard' | 'edit';
  /** A finished clip to show as the card's moving thumbnail. */
  previewUrl: string | null;
  clipCount: number;
  updatedAt: string;
};

/**
 * Everything a creator can open in the editor: films with finished takes, storyboards with ready
 * shots, and edits they already started (including ones built only from uploaded footage).
 */
export async function listEditableWork(): Promise<{ data?: EditableWork[]; error?: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: 'Please sign in.' };

  const [projectsRes, filmsRes, storyboardRes, timelinesRes] = await Promise.all([
    db.from('projects').select('id,name,updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(100),
    db.from('production_jobs').select('project_id,brief,plan,updated_at').eq('user_id', user.id).not('project_id', 'is', null).order('updated_at', { ascending: false }).limit(50),
    db.from('fast_video_storyboard_items').select('project_id,url').eq('status', 'ready').not('url', 'is', null).limit(1000),
    db.from('timeline_projects').select('id,project_id,updated_at').limit(200),
  ]);
  if (projectsRes.error) return { error: 'Could not load your work.' };
  const projects = new Map((projectsRes.data || []).map((p) => [p.id as string, p]));

  const work = new Map<string, EditableWork>();
  const upsert = (projectId: string, patch: Partial<EditableWork> & Pick<EditableWork, 'kind'>) => {
    const project = projects.get(projectId);
    if (!project) return;
    const current = work.get(projectId);
    work.set(projectId, {
      projectId,
      title: current?.title || project.name,
      previewUrl: current?.previewUrl ?? null,
      clipCount: current?.clipCount ?? 0,
      updatedAt: current?.updatedAt || project.updated_at,
      ...patch,
      // A film outranks a storyboard, which outranks a plain edit, when one project is several.
      kind: current && rank(current.kind) > rank(patch.kind) ? current.kind : patch.kind,
    });
  };

  for (const item of storyboardRes.data || []) {
    const current = work.get(item.project_id);
    upsert(item.project_id, { kind: 'storyboard', previewUrl: current?.previewUrl || item.url, clipCount: (current?.clipCount || 0) + 1 });
  }

  const filmProjects = (filmsRes.data || []).filter((f) => f.project_id && projects.has(f.project_id));
  if (filmProjects.length) {
    const { data: scenes } = await db.from('scenes').select('id,project_id').in('project_id', filmProjects.map((f) => f.project_id!));
    const sceneProject = new Map((scenes || []).map((s) => [s.id as string, s.project_id as string]));
    const { data: takes } = sceneProject.size
      ? await db.from('shots').select('scene_id,shot_generations!shot_generations_shot_id_fkey(output_url,status)').in('scene_id', [...sceneProject.keys()])
      : { data: [] };
    const finished = new Map<string, { count: number; url: string | null }>();
    for (const shot of takes || []) {
      const projectId = sceneProject.get(shot.scene_id as string);
      const done = ((shot.shot_generations || []) as { output_url: string | null; status: string }[]).find((g) => g.status === 'completed' && g.output_url);
      if (!projectId || !done) continue;
      const entry = finished.get(projectId) || { count: 0, url: null };
      finished.set(projectId, { count: entry.count + 1, url: entry.url || done.output_url });
    }
    for (const film of filmProjects) {
      const plan = film.plan as { crew?: { bible?: { title?: string } } } | null;
      const title = plan?.crew?.bible?.title || film.brief.replace(/\s+/g, ' ').slice(0, 80);
      const done = finished.get(film.project_id!);
      upsert(film.project_id!, { kind: 'film', title, previewUrl: done?.url ?? null, clipCount: done?.count ?? 0, updatedAt: film.updated_at });
    }
  }

  for (const timeline of timelinesRes.data || []) {
    if (!work.has(timeline.project_id)) upsert(timeline.project_id, { kind: 'edit', updatedAt: timeline.updated_at });
    else work.set(timeline.project_id, { ...work.get(timeline.project_id)!, updatedAt: maxDate(work.get(timeline.project_id)!.updatedAt, timeline.updated_at) });
  }

  return { data: [...work.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
}

/** A fresh, empty edit for footage from the creator's own devices. Returns the project to open. */
export async function startBlankEdit(): Promise<{ projectId?: string; error?: string }> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: 'Please sign in.' };
  const limit = await canCreateProject(db, user.id);
  if (!limit.allowed) return { error: limit.message };
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const { data, error } = await db.from('projects').insert({ user_id: user.id, name: `My edit · ${date}`, description: 'Edited from my own videos' }).select('id').single();
  if (error || !data) return { error: 'Could not start a new edit. Try again.' };
  return { projectId: data.id };
}

function rank(kind: EditableWork['kind']) {
  return kind === 'film' ? 2 : kind === 'storyboard' ? 1 : 0;
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}
