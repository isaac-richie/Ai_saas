import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createAdminClient, hasSupabaseAdminEnv } from '@/infrastructure/supabase/admin';
import { getShareForGuest, isShareToken } from '@/core/services/video-review';
import { ReviewClient } from '@/interface/components/review/ReviewClient';

export const dynamic = 'force-dynamic';

// Review links are private: never indexed, never previewed with the video in link unfurls.
export const metadata: Metadata = {
  title: 'Video for review',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token) || !hasSupabaseAdminEnv()) notFound();
  const share = await getShareForGuest(createAdminClient(), token);
  if (!share) notFound();
  return <ReviewClient token={token} initial={share} />;
}
