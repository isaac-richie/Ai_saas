import { getProjects } from "@/core/actions/projects";
import { CreateProjectDialog } from "@/interface/components/dashboard/CreateProjectDialog";
import { ProjectList } from "@/interface/components/dashboard/ProjectList";
import { Badge } from "@/interface/components/ui/badge";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Projects | AI Cinematography Dashboard",
};

export default async function ProjectsPage() {
    const result = await getProjects();
    const projects = result.data || [];

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 py-2 md:py-3">
            <section data-reveal="hero" className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Projects</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">All Projects</h1>
                        <p className="mt-2 text-sm text-white/50 md:text-base">
                            Organize productions, open project workspaces, and manage scene pipelines.
                        </p>
                    </div>
                    <CreateProjectDialog />
                </div>
            </section>

            <section data-reveal="card" className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Project Library</h2>
                <ProjectList projects={projects} />
            </section>
        </div>
    );
}
