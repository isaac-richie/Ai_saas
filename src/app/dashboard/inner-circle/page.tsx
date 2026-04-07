import { redirect } from 'next/navigation';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createClient } from '@/infrastructure/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/interface/components/ui/card';
import { AnimatedCounter } from '@/interface/components/ui/AnimatedCounter';
import { Badge } from '@/interface/components/ui/badge';
import { Users, Trophy, UserPlus } from 'lucide-react';

export const dynamic = 'force-dynamic';

type WaitlistRow = {
  id: string;
  full_name: string;
  instagram_handle: string;
  social_handle: string;
  email: string;
  referral_code: string;
  referred_by_code: string | null;
  referral_count: number;
  created_at: string;
};

function getBaseUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

function getAdminAllowlist(): string[] {
  const raw = process.env.INNER_CIRCLE_ADMIN_EMAILS || process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export default async function InnerCircleDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const viewerEmail = user?.email?.toLowerCase() || '';
  const allowlist = getAdminAllowlist();

  if (!viewerEmail || !allowlist.includes(viewerEmail)) {
    redirect('/dashboard');
  }

  const admin = createAdminClient();

  const [topReferralsResult, latestResult, totalResult] = await Promise.all([
    admin
      .from('inner_circle_waitlist')
      .select('id, full_name, instagram_handle, social_handle, email, referral_code, referred_by_code, referral_count, created_at')
      .order('referral_count', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10),
    admin
      .from('inner_circle_waitlist')
      .select('id, full_name, instagram_handle, social_handle, email, referral_code, referred_by_code, referral_count, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    admin.from('inner_circle_waitlist').select('id', { count: 'exact', head: true }),
  ]);

  if (topReferralsResult.error) {
    throw new Error(topReferralsResult.error.message);
  }

  if (latestResult.error) {
    throw new Error(latestResult.error.message);
  }

  const topReferrals = (topReferralsResult.data || []) as WaitlistRow[];
  const latest = (latestResult.data || []) as WaitlistRow[];
  const totalLeads = totalResult.count || 0;
  const totalReferrals = latest.reduce((sum, row) => sum + (row.referral_count || 0), 0);
  const siteBaseUrl = getBaseUrl();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border border-white/10 bg-[#0f1012] text-white">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-white/55">Inner Circle Leads</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <p className="text-3xl font-semibold"><AnimatedCounter end={totalLeads} /></p>
            <Users className="h-5 w-5 text-white/45" />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-white/10 bg-[#0f1012] text-white">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-white/55">Tracked Referrals</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <p className="text-3xl font-semibold"><AnimatedCounter end={totalReferrals} /></p>
            <UserPlus className="h-5 w-5 text-white/45" />
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-white/10 bg-[#0f1012] text-white">
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-white/55">Top 10 Slots</CardTitle>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <p className="text-3xl font-semibold">10</p>
            <Trophy className="h-5 w-5 text-white/45" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-3xl border border-white/10 bg-[#0f1012] text-white">
          <CardHeader>
            <CardTitle>Top Referral Leaderboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topReferrals.length === 0 ? (
              <p className="text-sm text-white/55">No referrals yet.</p>
            ) : (
              topReferrals.map((entry, index) => (
                <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        #{index + 1} {entry.full_name}
                      </p>
                      <p className="text-xs text-white/55">@{entry.instagram_handle} • @{entry.social_handle}</p>
                    </div>
                    <Badge className="rounded-full border border-cyan-300/30 bg-cyan-300/10 text-cyan-200">
                      {entry.referral_count} referrals
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-white/45">{siteBaseUrl}/inner-circle?ref={entry.referral_code}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-white/10 bg-[#0f1012] text-white">
          <CardHeader>
            <CardTitle>Latest Signups</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {latest.length === 0 ? (
              <p className="text-sm text-white/55">No signups yet.</p>
            ) : (
              latest.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                  <p className="font-semibold text-white">{entry.full_name}</p>
                  <p className="text-white/55">{entry.email}</p>
                  <p className="text-white/45">Code: {entry.referral_code}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
