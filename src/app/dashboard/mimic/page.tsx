import { notFound } from 'next/navigation';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';
import { MimicStudio } from '@/interface/components/mimic/MimicStudio';
import { MIMIC_ENABLED } from '@/core/config/feature-flags';

export const dynamic = 'force-dynamic';
// Preparing a take and saving a result run ffmpeg inside this page's server actions.
export const maxDuration = 300;
export const metadata = { title: 'Mimic' };

/** Mimic (beta): record or upload a performance, say who or what changes, review the cost, generate. */
export default function MimicPage() {
  if (!MIMIC_ENABLED) notFound();
  return (
    <div className="workspace-page space-y-8">
      <WorkspaceHeading
        label="MIMIC · BETA"
        title="Perform it. Transform it."
        description="Record or upload a performance, choose who or what changes, and get a new take that keeps your movement and timing. Nothing is generated until you approve the cost."
      />
      <MimicStudio />
    </div>
  );
}
