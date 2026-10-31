'use server';

import { createClient } from '@/infrastructure/supabase/server';
import { restoreRevision } from '@/core/services/timeline-revisions';

const UUID = /^[0-9a-f-]{36}$/i;

export interface RevisionSummary {
  id: string;
  label: string;
  created_at: string;
}

/** The timeline's saved versions, newest first. Empty when none exist (or versions aren't set up yet). */
export async function listTimelineRevisions(timelineId: string): Promise<{ revisions: RevisionSummary[] }> {
  if (!UUID.test(timelineId)) return { revisions: [] };
  const supabase = await createClient();
  const { data } = await supabase
    .from('timeline_revisions')
    .select('id, label, created_at')
    .eq('timeline_id', timelineId)
    .order('created_at', { ascending: false })
    .limit(30);
  return { revisions: (data || []) as RevisionSummary[] };
}

export async function restoreTimelineRevision(revisionId: string): Promise<{ success: true } | { error: string }> {
  if (!UUID.test(revisionId)) return { error: 'That version could not be found.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in.' };
  const result = await restoreRevision(supabase, { userId: user.id, revisionId });
  return 'error' in result ? result : { success: true };
}
