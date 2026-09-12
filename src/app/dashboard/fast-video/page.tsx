import Link from 'next/link';
import { ArrowUpRight, Film } from 'lucide-react';
import { FastVideoStudio } from '@/interface/components/fast-video/FastVideoStudio';
import { getProjects } from '@/core/actions/projects';
import { getScenes } from '@/core/actions/scenes';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';

export const metadata = { title: 'Fast Track' };

export default async function FastVideoPage() {
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
          Kling <i /> Seedance <i /> Sora
        </span>
      </div>
      <FastVideoStudio projects={projectsWithScenes} />
    </div>
  );
}
