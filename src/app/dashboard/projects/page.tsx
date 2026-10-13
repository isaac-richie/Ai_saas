import { getProjects } from "@/core/actions/projects";
import { CreateProjectDialog } from "@/interface/components/dashboard/CreateProjectDialog";
import { ProjectList } from "@/interface/components/dashboard/ProjectList";
import { WorkspaceHeading } from "@/interface/components/layout/WorkspaceHeading";
import { ErrorStatePanel } from "@/interface/components/ui/state-panels";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Projects | AI Cinematography Dashboard",
};

export default async function ProjectsPage() {
    const result = await getProjects();
    const projects = result.data || [];

    return (
        <div className="workspace-page workspace-projects">
            <WorkspaceHeading
                label="01 / THE SLATE"
                title="Every production, at a glance."
                description="Organize productions, open project workspaces, and manage scene pipelines."
                actions={<CreateProjectDialog />}
            />
            <section className="workspace-section">
                <div className="workspace-section-title">
                    <div>
                        <span className="workspace-eyebrow">PROJECT LIBRARY</span>
                        <h2>Your productions</h2>
                    </div>
                </div>
                {result.error ? (
                    <ErrorStatePanel
                        compact
                        title="Projects couldn't load"
                        description="Refresh the page to try again. Your existing projects have not been changed."
                    />
                ) : (
                    <ProjectList projects={projects} />
                )}
            </section>
        </div>
    );
}
