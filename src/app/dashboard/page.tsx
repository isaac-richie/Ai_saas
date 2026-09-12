import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, FolderKanban, Clapperboard, Film } from 'lucide-react';
import { getProjects } from '@/core/actions/projects';
import { CreateProjectDialog } from '@/interface/components/dashboard/CreateProjectDialog';
import { ProjectList } from '@/interface/components/dashboard/ProjectList';
import { NewUserChecklist } from '@/interface/components/onboarding/NewUserChecklist';
import { StartTourButton } from '@/interface/components/onboarding/StartTourButton';
import { AnimatedCounter } from '@/interface/components/ui/AnimatedCounter';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';
import { ErrorStatePanel } from '@/interface/components/ui/state-panels';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const result = await getProjects();
  const projects = result.data || [];
  const activeCount = projects.filter((project) => project.status === 'active').length;
  const totalScenes = projects.reduce((sum, project) => sum + (project.scene_count ?? 0), 0);
  const hasGeneratedAsset = projects.some((project) => (project.shot_count ?? 0) > 0);

  return (
    <div className="workspace-page">
      <WorkspaceHeading
        label="01 / YOUR WORKSPACE"
        title="The director's desk."
        description="Your projects, your ideas, your next great frame."
        actions={<CreateProjectDialog />}
      />
      {result.error ? (
        <ErrorStatePanel
          compact
          title="Projects couldn't load"
          description="Refresh the page to try again. Your existing projects have not been changed."
        />
      ) : null}
      <section className="workspace-welcome">
        <div className="workspace-welcome-copy">
          <span className="workspace-eyebrow">READY WHEN INSPIRATION STRIKES</span>
          <h2>
            A new idea.
            <br />
            <em>A new possibility.</em>
          </h2>
          <p>
            Turn a thought into a directed shot. Start in Fast Track and give your vision room to
            grow.
          </p>
          <Link href="/dashboard/fast-video" className="workspace-primary-link">
            Create a video <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="workspace-welcome-image">
          <Image
            src="/studio-plate-2.webp"
            alt="A film crew setting up a scene on a soundstage"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 45vw"
          />
          <span>VISIOWAVE / IN THE MAKING</span>
        </div>
      </section>
      <section className="workspace-stats" aria-label="Project activity">
        {[
          { label: 'Projects', value: projects.length, icon: FolderKanban },
          { label: 'Active productions', value: activeCount, icon: Clapperboard },
          { label: 'Scenes', value: totalScenes, icon: Film },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} strokeWidth={1.5} />
            </div>
            <p>{result.error ? '—' : <AnimatedCounter end={value} />}</p>
          </article>
        ))}
      </section>
      <section id="projects" className="workspace-section">
        <div className="workspace-section-title">
          <div>
            <span className="workspace-eyebrow">THE WORK IN PROGRESS</span>
            <h2>Your productions</h2>
          </div>
          <Link href="/dashboard/projects" className="workspace-text-link">
            All projects <ArrowUpRight size={16} />
          </Link>
        </div>
        {!result.error && <ProjectList projects={projects} />}
      </section>
      {!result.error && (
        <NewUserChecklist
          projectCount={projects.length}
          sceneCount={totalScenes}
          hasGeneratedAsset={hasGeneratedAsset}
        />
      )}
      <section className="workspace-guide">
        <div>
          <span className="workspace-eyebrow">FIND YOUR RHYTHM</span>
          <h2>A little guidance goes a long way.</h2>
          <p>Take a quick tour of the tools behind your next production.</p>
        </div>
        <StartTourButton />
      </section>
    </div>
  );
}
