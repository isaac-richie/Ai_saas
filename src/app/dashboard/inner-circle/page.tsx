import { redirect } from 'next/navigation';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createClient } from '@/infrastructure/supabase/server';
import { getAppBaseUrl } from '@/core/utils/app-url';
import { isAdminEmail } from '@/core/services/beta-access';
import type { WaitlistRow } from '@/core/utils/inner-circle/insights';
import { InnerCircleAdminView } from '@/interface/components/admin/InnerCircleAdminView';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inner Circle' };

const COLUMNS = 'id, full_name, instagram_handle, social_handle, feedback_text, status, email, referral_code, referred_by_code, referral_count, created_at';

/** Server component: rendered once per request, so reading the clock here is safe. */
function requestTime() {
  return Date.now();
}

export default async function InnerCircleDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) redirect('/dashboard');

  const { data, error } = await createAdminClient()
    .from('inner_circle_waitlist')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  return <InnerCircleAdminView rows={(data || []) as WaitlistRow[]} now={requestTime()} siteBaseUrl={getAppBaseUrl()} />;
}
