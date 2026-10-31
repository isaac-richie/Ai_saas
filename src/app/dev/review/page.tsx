import { notFound } from 'next/navigation';
import { ReviewClient } from '@/interface/components/review/ReviewClient';
import type { GuestShare } from '@/core/services/video-review';

export const metadata = { title: 'Review preview' };

const sample: GuestShare = {
  id: 'dev',
  title: 'Golden Hour — teaser',
  video_url: '/__dev/shot2.mp4',
  duration_ms: 4000,
  status: 'in_review',
  allow_comments: true,
  created_at: '2026-10-31T12:00:00Z',
  notes: [
    { id: 'n1', author_name: 'Maya (client)', kind: 'note', body: 'Love this colour. Can the sky hold a second longer?', at_ms: 1200, resolved: false, created_at: '2026-10-31T12:05:00Z' },
    { id: 'n2', author_name: 'Tunde', kind: 'note', body: 'Logo should appear here.', at_ms: 3100, resolved: true, created_at: '2026-10-31T12:07:00Z' },
  ],
};

/** Local-only preview of the review page with sample notes; never served in production. */
export default function DevReviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ReviewClient token={'d'.repeat(43)} initial={sample} />;
}
