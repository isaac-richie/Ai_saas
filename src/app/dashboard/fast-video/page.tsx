import Link from 'next/link';
import { ArrowUpRight, Film } from 'lucide-react';
import { FastVideoStudio } from '@/interface/components/fast-video/FastVideoStudio';
import { getProjects } from '@/core/actions/projects';
import { getScenes } from '@/core/actions/scenes';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';
import { ProductionDesk } from '@/interface/components/fast-video/ProductionDesk';

export const metadata = { title: 'Fast Track' };

export default async function FastVideoPage({ searchParams }: { searchParams?: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  const projectsResult = await getProjects();
  const projectsWithScenes = await Promise.all(
    (projectsResult.data || []).map(async (project) => {
      const scenesResult = await getScenes(project.id);
      return {
        id: project.id,
        name: project.name,
        scenes: (scenesResult.data || []).map(({ id, name }) => ({ id, name })),
      };
    })
  );
  return (
    <div className="workspace-page workspace-fast">
      <WorkspaceHeading
        label="03 / THE CREATIVE FLOOR"
        title="Let's make a scene."
        description="Start with an idea. Shape the shot. Find the take."
        actions={
          <Link href="/dashboard/gallery" className="workspace-secondary-link">
            Your gallery <ArrowUpRight size={16} />
          </Link>
        }
      />
      <div className="workspace-session-bar">
        <span>
          <Film size={15} /> Fast Track
        </span>
        <span>
          Kling <i /> Seedance
        </span>
      </div>
      <ProductionDesk />
      <details open={params?.mode === 'single-shot'} className="lux-glass group/single mb-8 rounded-3xl p-4 sm:p-6">
        <summary className="flex list-none items-center justify-between gap-4 text-base text-white [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-gold-400/20 bg-gold-400/[0.06] text-gold-300">
              <Film size={16} strokeWidth={1.6} />
            </span>
            <span>
              <span className="block font-light tracking-tight">Single-shot <span className="lux-serif text-gold-300">studio</span></span>
              <span className="block text-xs text-[#8f9086]">Create one video directly</span>
            </span>
          </span>
          <span className="grid size-8 place-items-center rounded-full border border-gold-400/20 text-gold-300 transition-transform duration-500 group-open/single:rotate-45">+</span>
        </summary>
        <div className="mt-6"><FastVideoStudio projects={projectsWithScenes} /></div>
      </details>
    </div>
  );
}
