import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { getProjects } from '@/core/actions/projects';
import { CreateProjectDialog } from '@/interface/components/dashboard/CreateProjectDialog';
import { ProjectList } from '@/interface/components/dashboard/ProjectList';
import { StartCards } from '@/interface/components/dashboard/StartCards';
import { StartTourButton } from '@/interface/components/onboarding/StartTourButton';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';
import { ErrorStatePanel } from '@/interface/components/ui/state-panels';

export const metadata = { title: 'Home' };

export default async function DashboardPage() {
  const result = await getProjects();
  const projects = result.data || [];

  return (
    <div className="workspace-page">
      <WorkspaceHeading
        label="HOME"
        title="What do you want to make today?"
        description="Pick a starting point. You can switch any time."
      />
      {result.error ? (
        <ErrorStatePanel
          compact
          title="Projects couldn't load"
          description="Refresh the page to try again. Your existing projects have not been changed."
        />
      ) : null}
      <StartCards />
      {projects.length > 0 ? (
        <section id="projects" className="workspace-section">
          <div className="workspace-section-title">
            <div>
              <span className="workspace-eyebrow">PICK UP WHERE YOU LEFT OFF</span>
              <h2>Your projects</h2>
            </div>
            <div className="flex items-center gap-3">
              <CreateProjectDialog />
              <Link href="/dashboard/projects" className="workspace-text-link">
                All projects <ArrowUpRight size={16} />
              </Link>
            </div>
          </div>
          <ProjectList projects={projects} />
        </section>
      ) : null}
      <section className="workspace-guide">
        <div>
          <span className="workspace-eyebrow">NEW HERE?</span>
          <h2>Take the 30-second tour.</h2>
          <p>See where to create, where your longer films live, and where your videos land.</p>
        </div>
        <StartTourButton />
      </section>
    </div>
  );
}
