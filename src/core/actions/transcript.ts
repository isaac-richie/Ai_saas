'use server';

import { createClient } from '@/infrastructure/supabase/server';
import { correctWords, readWords, type SourceTranscript } from '@/core/services/transcript';

const UUID = /^[0-9a-f-]{36}$/i;

/** The timeline's transcripts, one per source video. Empty when none exist yet. */
export async function getTimelineTranscripts(timelineId: string): Promise<{ transcripts: SourceTranscript[]; ready: boolean }> {
  if (!UUID.test(timelineId)) return { transcripts: [], ready: true };
  const supabase = await createClient();
  const { data, error } = await supabase.from('timeline_transcripts').select('source_key, language, words').eq('timeline_id', timelineId);
  // A missing table means the database update hasn't been run; the panel says so.
  if (error) return { transcripts: [], ready: false };
  return { transcripts: (data || []).map((r) => ({ source_key: r.source_key, language: r.language, words: readWords(r.words) })), ready: true };
}

/** Fixes the spelling of one word. Only the text changes; the footage and its timing do not. */
export async function correctTranscriptWord(
  timelineId: string,
  sourceKey: string,
  wordId: string,
  text: string,
): Promise<{ words: SourceTranscript['words'] } | { error: string }> {
  if (!UUID.test(timelineId) || typeof sourceKey !== 'string' || typeof wordId !== 'string' || typeof text !== 'string') return { error: 'That word could not be found.' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Please sign in.' };
  const { data: row } = await supabase
    .from('timeline_transcripts')
    .select('id, words, updated_at')
    .eq('timeline_id', timelineId)
    .eq('source_key', sourceKey)
    .maybeSingle();
  if (!row) return { error: 'That transcript could not be found.' };
  const words = correctWords(readWords(row.words), wordId, text);
  if (!words) return { error: 'Type the word as it should read (up to 60 characters).' };
  // Only lands if nobody re-transcribed in between; otherwise the creator tries again on the new text.
  const { data: saved, error } = await supabase
    .from('timeline_transcripts')
    .update({ words, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('updated_at', row.updated_at)
    .select('id');
  if (error || !saved?.length) return { error: 'The transcript changed. Try that correction again.' };
  return { words };
}
