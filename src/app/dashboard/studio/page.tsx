import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/interface/components/ui/badge";
import { CreateProjectDialog } from "@/interface/components/dashboard/CreateProjectDialog";
import { getProjects } from "@/core/actions/projects";
import { getScenes } from "@/core/actions/scenes";
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card";
import { createClient } from "@/infrastructure/supabase/server";
import { EmptyStatePanel } from "@/interface/components/ui/state-panels";

export const metadata: Metadata = {
    title: "Studio | AI Cinematography Dashboard",
};

interface StudioPageProps {
    searchParams?: Promise<{
        overview?: string;
    }>;
}

export default async function StudioPage(props: StudioPageProps) {
    const searchParams = props.searchParams ? await props.searchParams : undefined;
    const showOverview = searchParams?.overview === "1";

    if (!showOverview) {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
            const { data: latestScene } = await supabase
                .from("scenes")
                .select("id, project_id, created_at, projects!inner(user_id)")
                .eq("projects.user_id", user.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestScene?.id && latestScene.project_id) {
                redirect(`/dashboard/projects/${latestScene.project_id}/scenes/${latestScene.id}`);
            }
        }
    }

    const projectsResult = await getProjects();
    const projects = projectsResult.data || [];

    const sceneBatches = await Promise.all(
        projects.slice(0, 12).map(async (project) => {
            const scenesResult = await getScenes(project.id);
            return {
                projectId: project.id,
                scenes: scenesResult.data || [],
            };
        })
    );

    const sceneMap = new Map(sceneBatches.map((entry) => [entry.projectId, entry.scenes]));
    const totalScenes = sceneBatches.reduce((sum, entry) => sum + entry.scenes.length, 0);
    const activeProjects = sceneBatches.filter((entry) => entry.scenes.length > 0).length;
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const recentScenes = sceneBatches
        .flatMap((entry) => {
            const project = projectById.get(entry.projectId);
            return entry.scenes.map((scene) => ({
                ...scene,
                projectId: entry.projectId,
                projectName: project?.name || "Project",
            }));
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
            <section data-reveal="hero" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)] md:p-6">
                <div className="pointer-events-none absolute inset-0">
                    <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-[#d9a066]/15 blur-[80px]" />
                    <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#6e8a8f]/10 blur-[90px]" />
                    <div className="data-grid-bg absolute inset-0 opacity-[0.22]" />
                </div>
                <div className="relative flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Studio</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Scene Workspace</h1>
                        <p className="mt-2 text-sm text-white/50 md:text-base">
                            Jump into active scenes, continue shot composition, and manage project workspaces.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <CreateProjectDialog />
                        <Link href="/dashboard/gallery" className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
                            Open Gallery
                        </Link>
                    </div>
                </div>
            </section>

            <section data-reveal="card" className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#0f1012] p-4 text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/50">Projects</div>
                    <div className="mt-2 text-2xl font-semibold">{projects.length}</div>
                    <div className="mt-1 text-xs text-white/45">Active: {activeProjects}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0f1012] p-4 text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/50">Scenes</div>
                    <div className="mt-2 text-2xl font-semibold">{totalScenes}</div>
                    <div className="mt-1 text-xs text-white/45">Across all projects</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-[#0f1012] p-4 text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/50">Focus</div>
                    <div className="mt-2 text-2xl font-semibold">{recentScenes.length}</div>
                    <div className="mt-1 text-xs text-white/45">Recently updated scenes</div>
                </div>
            </section>

            <section data-reveal="card" className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Recent Scenes</h2>
                {recentScenes.length === 0 ? (
                    <EmptyStatePanel compact title="No scenes yet" description="Create one scene to start composing shots and generating visuals." />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {recentScenes.map((scene) => (
                            <Card key={scene.id} className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                                <CardHeader className="pb-2">
                                    <CardTitle className="line-clamp-1 text-base">{scene.name}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="text-xs uppercase tracking-[0.2em] text-white/50">{scene.projectName}</div>
                                    <p className="line-clamp-2 text-sm text-white/55">
                                        {scene.description || "No scene description yet."}
                                    </p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-white/45">
                                            {new Date(scene.created_at).toLocaleDateString()}
                                        </span>
                                        <Link
                                            href={`/dashboard/projects/${scene.projectId}/scenes/${scene.id}`}
                                            className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
                                        >
                                            Open Scene
                                        </Link>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </section>

            <section data-reveal="card" className="space-y-3">
                <h2 className="text-lg font-semibold text-white">Projects in Studio</h2>
                {projects.length === 0 ? (
                    <EmptyStatePanel compact title="No projects yet" description="Create your first project to open Studio workflows." />
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => {
                            const scenes = sceneMap.get(project.id) || [];
                            const firstScene = scenes[0];

                            return (
                                <Card key={project.id} className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] transition-all hover:border-white/25 hover:shadow-[0_28px_50px_-40px_rgba(0,0,0,0.9)]">
                                    <CardHeader className="pb-2">
                                        <CardTitle className="line-clamp-1 text-lg">{project.name}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <p className="line-clamp-2 text-sm text-white/55">
                                            {project.description || "No project description yet."}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">Scenes: {scenes.length}</span>
                                            {firstScene && (
                                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">Next: {firstScene.name}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <Link href={`/dashboard/projects/${project.id}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10">
                                                Workspace
                                            </Link>
                                            {firstScene ? (
                                                <Link href={`/dashboard/projects/${project.id}/scenes/${firstScene.id}`} className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
                                                    Open Studio
                                                </Link>
                                            ) : (
                                                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/45">
                                                    Add a scene to open studio
                                                </span>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
