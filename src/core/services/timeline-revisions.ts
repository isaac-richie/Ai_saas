import type { SupabaseClient } from '@supabase/supabase-js';

/** A saved version of a cut: the shots row and the look, enough to put the edit back exactly. */
export interface RevisionSnapshot {
  grade: string;
  track_id: string;
  clips: Record<string, unknown>[];
}

// The columns a restored shot gets back; anything else in a stored snapshot is ignored.
const CLIP_COLUMNS = [
  'id', 'track_id', 'take_id', 'asset_url', 'clip_type', 'start_ms', 'end_ms', 'trim_start_ms', 'trim_end_ms',
  'volume', 'opacity', 'transition_in', 'transition_in_ms', 'transition_out', 'transition_out_ms',
  'color_grade_id', 'metadata', 'order_index',
] as const;

const MAX_REVISIONS_KEPT = 30;

/** Saves the timeline's shots and look as a version. Returns its id, or null when it couldn't be saved. */
export async function saveRevision(
  db: SupabaseClient,
  ctx: { userId: string; timelineId: string; trackId: string; label: string },
): Promise<string | null> {
  const { data: timeline } = await db.from('timeline_projects').select('color_grade_id').eq('id', ctx.timelineId).maybeSingle();
  const { data: clips } = await db.from('timeline_clips').select('*').eq('track_id', ctx.trackId);
  if (!timeline || !clips) return null;
  const snapshot: RevisionSnapshot = { grade: timeline.color_grade_id || 'natural', track_id: ctx.trackId, clips };
  const { data, error } = await db
    .from('timeline_revisions')
    .insert({ timeline_id: ctx.timelineId, user_id: ctx.userId, label: ctx.label.slice(0, 200), snapshot })
    .select('id')
    .single();
  if (error || !data) return null;
  // Keep the newest versions; older ones are tidied away.
  const { data: old } = await db
    .from('timeline_revisions')
    .select('id')
    .eq('timeline_id', ctx.timelineId)
    .order('created_at', { ascending: false })
    .range(MAX_REVISIONS_KEPT, MAX_REVISIONS_KEPT + 50);
  if (old?.length) await db.from('timeline_revisions').delete().in('id', old.map((r: { id: string }) => r.id));
  return data.id as string;
}

/**
 * Puts a saved version back: its shots return exactly as they were, shots added since are removed,
 * and the look is restored. The current cut is saved first, so a restore can itself be undone.
 */
export async function restoreRevision(
  db: SupabaseClient,
  ctx: { userId: string; revisionId: string },
): Promise<{ ok: true; savedCurrent: string | null } | { error: string }> {
  const { data: revision } = await db
    .from('timeline_revisions')
    .select('id, timeline_id, snapshot')
    .eq('id', ctx.revisionId)
    .maybeSingle();
  const snap = revision?.snapshot as RevisionSnapshot | undefined;
  if (!revision || !snap || !Array.isArray(snap.clips) || typeof snap.track_id !== 'string') return { error: 'That version could not be found.' };

  // The shots row must still belong to this timeline.
  const { data: track } = await db.from('timeline_tracks').select('id, timeline_id').eq('id', snap.track_id).maybeSingle();
  if (!track || track.timeline_id !== revision.timeline_id) return { error: 'That version no longer matches this video.' };

  const savedCurrent = await saveRevision(db, { userId: ctx.userId, timelineId: revision.timeline_id, trackId: snap.track_id, label: 'Before restoring an earlier version' });

  const rows = snap.clips
    .filter((c) => c && typeof c.id === 'string' && c.track_id === snap.track_id)
    .map((c) => Object.fromEntries(CLIP_COLUMNS.filter((k) => k in c).map((k) => [k, c[k]])));
  const keep = new Set(rows.map((r) => r.id as string));
  const { data: current } = await db.from('timeline_clips').select('id').eq('track_id', snap.track_id);
  const extra = (current || []).map((c: { id: string }) => c.id).filter((id: string) => !keep.has(id));
  if (extra.length) {
    const { error } = await db.from('timeline_clips').delete().in('id', extra);
    if (error) return { error: 'Could not restore that version.' };
  }
  if (rows.length) {
    const { error } = await db.from('timeline_clips').upsert(rows, { onConflict: 'id' });
    if (error) return { error: 'Could not restore that version.' };
  }
  await db.from('timeline_projects').update({ color_grade_id: snap.grade || 'natural', updated_at: new Date().toISOString() }).eq('id', revision.timeline_id);
  return { ok: true, savedCurrent };
}
