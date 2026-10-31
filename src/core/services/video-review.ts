import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Review links. A guest holds nothing but the link's token, so every guest read and write
 * goes through here: it finds the one share the token unlocks and touches nothing else.
 */

export type ShareStatus = 'in_review' | 'approved' | 'changes_requested';
export type NoteKind = 'note' | 'approved' | 'changes_requested';

export interface ReviewNote {
  id: string;
  author_name: string;
  kind: NoteKind;
  body: string;
  at_ms: number | null;
  resolved: boolean;
  created_at: string;
}

export interface GuestShare {
  id: string;
  title: string;
  video_url: string;
  duration_ms: number;
  status: ShareStatus;
  allow_comments: boolean;
  created_at: string;
  notes: ReviewNote[];
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const MAX_NOTE_CHARS = 1000;
export const MAX_NAME_CHARS = 60;
export const MAX_NOTES_PER_SHARE = 500;

/** 32 random bytes as base64url: 43 characters nobody can guess. */
export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN.test(value);
}

/** Plain text only: control characters out, whitespace tidied, capped. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

const NOTE_FIELDS = 'id, author_name, kind, body, at_ms, resolved, created_at';

/** What a guest may see: the video, its status and the notes. Null for unknown or turned-off links. */
export async function getShareForGuest(db: SupabaseClient, token: string): Promise<GuestShare | null> {
  if (!isShareToken(token)) return null;
  const { data: share } = await db
    .from('video_shares')
    .select('id, title, video_url, duration_ms, status, allow_comments, revoked, created_at')
    .eq('token', token)
    .maybeSingle();
  if (!share || share.revoked) return null;
  const { data: notes } = await db
    .from('video_share_notes')
    .select(NOTE_FIELDS)
    .eq('share_id', share.id)
    .order('created_at', { ascending: true })
    .limit(MAX_NOTES_PER_SHARE);
  return {
    id: share.id,
    title: share.title,
    video_url: share.video_url,
    duration_ms: share.duration_ms,
    status: share.status,
    allow_comments: share.allow_comments,
    created_at: share.created_at,
    notes: (notes || []) as ReviewNote[],
  };
}

export type GuestNoteInput = { name?: unknown; body?: unknown; at_ms?: unknown; kind?: unknown };

/** A guest's note, approval or request for changes. Returns the saved note or a reason it was refused. */
export async function addGuestNote(
  db: SupabaseClient,
  token: string,
  input: GuestNoteInput,
): Promise<{ note: ReviewNote; status: ShareStatus } | { error: string; status: number }> {
  if (!isShareToken(token)) return { error: 'This review link is not valid.', status: 404 };
  const { data: share } = await db
    .from('video_shares')
    .select('id, duration_ms, status, allow_comments, revoked')
    .eq('token', token)
    .maybeSingle();
  if (!share || share.revoked) return { error: 'This review link has been turned off.', status: 404 };
  if (!share.allow_comments) return { error: 'Notes are closed on this video.', status: 403 };

  const kind: NoteKind = input.kind === 'approved' || input.kind === 'changes_requested' ? input.kind : 'note';
  const name = cleanText(input.name, MAX_NAME_CHARS);
  const body = cleanText(input.body, MAX_NOTE_CHARS);
  if (!name) return { error: 'Add your name so the team knows who said it.', status: 400 };
  if (kind === 'note' && !body) return { error: 'Write a note first.', status: 400 };

  const { count } = await db.from('video_share_notes').select('id', { count: 'exact', head: true }).eq('share_id', share.id);
  if ((count ?? 0) >= MAX_NOTES_PER_SHARE) return { error: 'This video has reached its limit of notes.', status: 429 };

  // A moment in the video, kept inside its length; approvals are about the whole video.
  const rawAt = Number(input.at_ms);
  const at_ms =
    kind !== 'note' || !Number.isFinite(rawAt) ? null : Math.round(Math.max(0, share.duration_ms > 0 ? Math.min(share.duration_ms, rawAt) : rawAt));

  const { data: note, error } = await db
    .from('video_share_notes')
    .insert({ share_id: share.id, author_name: name, kind, body, at_ms })
    .select(NOTE_FIELDS)
    .single();
  if (error || !note) return { error: 'Your note could not be saved. Try again.', status: 500 };

  let status = share.status as ShareStatus;
  if (kind !== 'note') {
    status = kind;
    await db.from('video_shares').update({ status, updated_at: new Date().toISOString() }).eq('id', share.id);
  }
  return { note: note as ReviewNote, status };
}

/** Where a note at a moment of the finished video sits, as "0:12". */
export function noteTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
