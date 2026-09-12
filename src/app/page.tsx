import { CinematicLanding } from '@/interface/components/landing/CinematicLanding';
import { createClient } from '@/infrastructure/supabase/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <CinematicLanding isAuthenticated={Boolean(user)} />;
}
