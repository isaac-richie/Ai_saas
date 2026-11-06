import { notFound } from 'next/navigation';
import { FastVideoStudio } from '@/interface/components/fast-video/FastVideoStudio';
import { ProductionDesk } from '@/interface/components/fast-video/ProductionDesk';
import { CreateModeSwitch } from '@/interface/components/fast-video/CreateModeSwitch';

export const metadata = { title: 'Create preview' };

/** Local-only preview of the Create screen's layout (no account data); never served in production. */
export default async function DevCreatePage({ searchParams }: { searchParams?: Promise<{ mode?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const params = await searchParams;
  return (
    <div className="h-dvh overflow-y-auto bg-obsidian-950 px-4 py-6 md:px-8">
      <div className="workspace-page workspace-fast mx-auto max-w-6xl">
        <CreateModeSwitch initialMode={params?.mode === 'film' ? 'film' : 'quick'} quick={<FastVideoStudio projects={[]} />} film={<ProductionDesk />} />
      </div>
    </div>
  );
}
