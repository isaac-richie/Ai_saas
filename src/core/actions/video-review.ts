'use server';

import { createClient } from '@/infrastructure/supabase/server';
import { newShareToken, type ReviewNote, type ShareStatus } from '@/core/services/video-review';

export interface OwnerShare {
  id: string;
  token: string;
  title: string;
  status: ShareStatus;
  created_at: string;
  storage_key: string | null;
  notes: ReviewNote[];
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * A review link for the timeline's latest finished video. Sharing the same video twice returns
 * the link it already has, so a link sent to a client keeps working.
 */
export async function createReviewLink(timelineId: string): Promise<{ share: OwnerShare } | { error: string }> {
  if (!UUID.test(timelineId)) return { error: 'Timeline not found.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in.' };

  const { data: timeline } = await supabase.from('timeline_projects').select('id, project_id, duration_ms').eq('id', timelineId).maybeSingle();
  if (!timeline) return { error: 'Timeline not found.' };
  const { data: job } = await supabase
    .from('timeline_render_jobs')
    .select('output_url, storage_key')
    .eq('timeline_id', timelineId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!job?.output_url) return { error: 'Make your video first, then share it.' };

  const { data: existing } = await supabase
    .from('video_shares')
    .select('id, token, title, status, created_at, storage_key')
    .eq('timeline_id', timelineId)
    .eq('storage_key', job.storage_key)
    .eq('revoked', false)
    .limit(1)
    .maybeSingle();
  if (existing) return { share: { ...existing, notes: [] } as OwnerShare };

  const { data: project } = await supabase.from('projects').select('name').eq('id', timeline.project_id).maybeSingle();
  const { data: created, error } = await supabase
    .from('video_shares')
    .insert({
      user_id: user.id,
      project_id: timeline.project_id,
      timeline_id: timelineId,
      token: newShareToken(),
      title: (project?.name || 'Video for review').slice(0, 120),
      video_url: job.output_url,
      storage_key: job.storage_key,
      duration_ms: Math.max(0, Math.round(timeline.duration_ms || 0)),
    })
    .select('id, token, title, status, created_at, storage_key')
    .single();
  if (error || !created) return { error: 'Could not make a review link. Try again.' };
  return { share: { ...created, notes: [] } as OwnerShare };
}

/** The timeline's live review links, newest first, each with its notes. */
export async function listReviewLinks(timelineId: string): Promise<{ shares: OwnerShare[] }> {
  if (!UUID.test(timelineId)) return { shares: [] };
  const supabase = await createClient();
  const { data: shares } = await supabase
    .from('video_shares')
    .select('id, token, title, status, created_at, storage_key')
    .eq('timeline_id', timelineId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(20);
  if (!shares?.length) return { shares: [] };
  const { data: notes } = await supabase
    .from('video_share_notes')
    .select('id, share_id, author_name, kind, body, at_ms, resolved, created_at')
    .in('share_id', shares.map((s) => s.id))
    .order('created_at', { ascending: true })
    .limit(1000);
  return {
    shares: shares.map((s) => ({
      ...s,
      notes: (notes || [])
        .filter((n) => n.share_id === s.id)
        .map((n) => ({ id: n.id, author_name: n.author_name, kind: n.kind, body: n.body, at_ms: n.at_ms, resolved: n.resolved, created_at: n.created_at }) as ReviewNote),
    })) as OwnerShare[],
  };
}

export async function setReviewNoteResolved(noteId: string, resolved: boolean) {
  if (!UUID.test(noteId)) return { error: 'Note not found.' };
  const supabase = await createClient();
  const { error } = await supabase.from('video_share_notes').update({ resolved: Boolean(resolved) }).eq('id', noteId);
  return error ? { error: 'Could not update the note.' } : { success: true };
}

/** Turns a link off for good: anyone holding it sees that it was turned off. */
export async function turnOffReviewLink(shareId: string) {
  if (!UUID.test(shareId)) return { error: 'Link not found.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('video_shares')
    .update({ revoked: true, updated_at: new Date().toISOString() })
    .eq('id', shareId);
  return error ? { error: 'Could not turn the link off.' } : { success: true };
}
