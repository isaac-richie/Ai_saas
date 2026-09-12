import Link from 'next/link';
import { ArrowUpRight, Download } from 'lucide-react';
import { MediaGallery } from '@/interface/components/media/MediaGallery';
import { getGalleryAssets } from '@/core/actions/gallery';
import { getProjects } from '@/core/actions/projects';
import { ErrorStatePanel } from '@/interface/components/ui/state-panels';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Gallery' };

export default async function GalleryPage({
  searchParams,
}: {
  searchParams?: Promise<{ projectId?: string }>;
}) {
  const params = await searchParams;
  const projectId = params?.projectId;
  const [result, projectsResult] = await Promise.all([getGalleryAssets(projectId), getProjects()]);
  const assets = result.data || [];
  const projectOptions = (projectsResult.data || []).map(({ id, name }) => ({ id, name }));
  const projectLabel = projectId
    ? projectOptions.find((project) => project.id === projectId)?.name || 'Selected project'
    : null;
  return (
    <div className="workspace-page workspace-gallery">
      <WorkspaceHeading
        label="02 / THE COLLECTION"
        title="Every frame, in one place."
        description="Review your takes, find the favourites, and shape what comes next."
        actions={
          <>
            <Link href="/dashboard/exports" className="workspace-secondary-link">
              <Download size={16} /> Exports
            </Link>
            <Link href="/dashboard/fast-video" className="workspace-primary-link">
              Create a video <ArrowUpRight size={17} />
            </Link>
          </>
        }
      />
      <div className="workspace-library-heading">
        <div>
          <span className="workspace-eyebrow">YOUR VISUAL LIBRARY</span>
          <h2>
            Collected frames <span>{typeof result.error === 'string' ? '' : assets.length}</span>
          </h2>
        </div>
        {projectLabel && (
          <Link href="/dashboard/gallery" className="workspace-secondary-link">
            {projectLabel} / Clear filter
          </Link>
        )}
      </div>
      {typeof result.error === 'string' ? (
        <ErrorStatePanel
          compact
          title="Unable to load gallery"
          description="Refresh the page to try again. Your saved media has not been changed."
        />
      ) : (
        <MediaGallery
          assets={assets}
          projectOptions={projectOptions}
          pendingIds={result.pendingIds || []}
        />
      )}
    </div>
  );
}
