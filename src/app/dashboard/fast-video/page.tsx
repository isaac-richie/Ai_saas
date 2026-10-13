import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { FastVideoStudio } from '@/interface/components/fast-video/FastVideoStudio';
import { getProjects } from '@/core/actions/projects';
import { getScenes } from '@/core/actions/scenes';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';
import { ProductionDesk } from '@/interface/components/fast-video/ProductionDesk';
import { CreateModeSwitch } from '@/interface/components/fast-video/CreateModeSwitch';

export const metadata = { title: 'Create' };

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
        label="CREATE"
        title="What will you make today?"
        description="Describe it in a sentence. We'll turn it into a cinematic video."
        actions={
          <Link href="/dashboard/gallery" className="workspace-secondary-link max-md:!hidden">
            My videos <ArrowUpRight size={16} />
          </Link>
        }
      />
      <CreateModeSwitch
        initialMode={params?.mode === 'film' ? 'film' : 'quick'}
        quick={<FastVideoStudio projects={projectsWithScenes} />}
        film={<ProductionDesk />}
      />
    </div>
  );
}
