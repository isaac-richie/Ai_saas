import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { Badge } from "@/interface/components/ui/badge";
import { CreateProjectDialog } from "@/interface/components/dashboard/CreateProjectDialog";
import { getProjects } from "@/core/actions/projects";
import { getScenes } from "@/core/actions/scenes";
import { createClient } from "@/infrastructure/supabase/server";
import { STUDIO_ENABLED } from "@/core/config/feature-flags";
import { ArrowRight, Lock } from "lucide-react";
import { WorkspaceHeading } from "@/interface/components/layout/WorkspaceHeading";

export const metadata: Metadata = {
    title: "Studio",
};

interface StudioPageProps {
    searchParams?: Promise<{
        overview?: string;
    }>;
}

export default async function StudioPage(props: StudioPageProps) {
    if (!STUDIO_ENABLED) {
        return (
            <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
                <section className="relative overflow-hidden rounded-3xl lux-glass lux-hairline p-6 text-white md:p-8">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-gold-400/15 blur-[80px]" />
                        <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#b6ddd3]/[0.07] blur-[90px]" />
                    </div>
                    <div className="relative mx-auto max-w-2xl text-center">
                        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-gold-400/[0.12] bg-white/10">
                            <Lock className="h-5 w-5 text-white/80" />
                        </div>
                        <Badge className="mb-4 rounded-full border border-gold-400/25 bg-gold-400/[0.07] px-3 text-[10px] font-medium uppercase tracking-[0.22em] text-gold-200">Studio</Badge>
                        <h1 className="text-3xl font-light tracking-[-0.04em] text-[#f6f1e4] md:text-[42px] md:leading-[1.08]">Studio Is Not Available In Beta</h1>
                        <p className="mt-3 text-sm text-white/55 md:text-base">
                            The Studio workspace is currently locked while we stabilize beta operations. It will be enabled automatically for mainnet release.
                        </p>
                        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                            <Link href="/dashboard/fast-video" className="rounded-xl border border-gold-400/[0.12] bg-white/10 px-4 py-2 text-sm text-white hover:bg-gold-400/[0.12] hover:text-gold-50">
                                Go to Create
                            </Link>
                            <Link href="/dashboard/gallery" className="rounded-xl border border-gold-400/[0.12] bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-gold-400/[0.08]">
                                My videos
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        );
    }

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

    const openLink = "inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] px-4 text-[13px] font-semibold text-[#1a160e] transition hover:brightness-105"
    const quietLink = "inline-flex min-h-11 items-center rounded-xl border border-gold-400/20 bg-white/[0.04] px-4 text-[13px] text-[#ece6d6] transition hover:border-gold-400/45"

    return (
        <div className="workspace-page">
            <WorkspaceHeading
                label="STUDIO"
                title="Make a longer film, scene by scene."
                description="Plan the scenes, pick the best image for every shot, then bring each one to life."
                actions={<CreateProjectDialog />}
            />

            {projects.length === 0 ? (
                <section data-reveal="card" className="space-y-4">
                    <ol className="grid gap-3 md:grid-cols-3">
                        {[
                            { step: "1", title: "Start a film project", body: "Give it a name, like “Summer lookbook” or “Episode 1”." },
                            { step: "2", title: "Add your scenes", body: "One scene per place or moment in your story." },
                            { step: "3", title: "Build each shot", body: "Describe it, choose the best image, then animate it into video." },
                        ].map(({ step, title, body }) => (
                            <li key={step} className="flex gap-4 rounded-2xl border border-gold-400/[0.14] bg-white/[0.02] p-5">
                                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold-300/40 text-[15px] text-gold-200">{step}</span>
                                <span>
                                    <span className="block text-[16px] font-medium text-[#f3eee2]">{title}</span>
                                    <span className="mt-1 block text-[14px] leading-snug text-[#B0B8C4]">{body}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                    <p className="text-[14px] text-[#B0B8C4]">
                        Just want one clip? <Link href="/dashboard/fast-video" className="text-gold-200 underline decoration-gold-400/40 underline-offset-4 hover:text-gold-50">Use Quick video instead</Link>.
                    </p>
                </section>
            ) : null}

            {recentScenes.length > 0 ? (
                <section data-reveal="card" className="space-y-3">
                    <div>
                        <span className="workspace-eyebrow">PICK UP WHERE YOU LEFT OFF</span>
                        <h2 className="mt-1 text-2xl font-light tracking-[-0.035em] text-[#f6f1e4]">Recent scenes</h2>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {recentScenes.map((scene) => (
                            <Link
                                key={scene.id}
                                href={`/dashboard/projects/${scene.projectId}/scenes/${scene.id}`}
                                className="lux-lift group flex flex-col gap-2 rounded-2xl border border-gold-400/[0.14] bg-obsidian-950 p-5 text-white transition hover:border-gold-400/40"
                            >
                                <span className="text-[12px] font-medium text-gold-300/85">{scene.projectName}</span>
                                <span className="line-clamp-1 text-[17px] text-[#f3eee2]">{scene.name}</span>
                                <span className="line-clamp-2 text-[14px] text-[#B0B8C4]">{scene.description || "No description yet."}</span>
                                <span className="mt-1 flex items-center justify-between text-[13px] text-[#B0B8C4]">
                                    {new Date(scene.created_at).toLocaleDateString()}
                                    <span className="inline-flex items-center gap-1 text-gold-200 transition-transform group-hover:translate-x-0.5">Open scene <ArrowRight className="size-4" /></span>
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            {projects.length > 0 ? (
                <section data-reveal="card" className="space-y-3">
                    <div>
                        <span className="workspace-eyebrow">YOUR FILMS</span>
                        <h2 className="mt-1 text-2xl font-light tracking-[-0.035em] text-[#f6f1e4]">Film projects <span className="text-[15px] text-[#B0B8C4]">{projects.length}</span></h2>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {projects.map((project) => {
                            const scenes = sceneMap.get(project.id) || [];
                            const firstScene = scenes[0];
                            return (
                                <article key={project.id} className="lux-lift flex flex-col gap-3 rounded-2xl border border-gold-400/[0.14] bg-obsidian-950 p-5 text-white transition hover:border-gold-400/40">
                                    <div>
                                        <h3 className="line-clamp-1 text-[18px] text-[#f3eee2]">{project.name}</h3>
                                        <p className="mt-1 line-clamp-2 text-[14px] text-[#B0B8C4]">{project.description || "No description yet."}</p>
                                    </div>
                                    <p className="text-[13px] text-[#B0B8C4]">{scenes.length === 0 ? "No scenes yet" : `${scenes.length} scene${scenes.length === 1 ? "" : "s"}`}</p>
                                    <div className="mt-auto flex flex-wrap gap-2">
                                        {firstScene ? (
                                            <Link href={`/dashboard/projects/${project.id}/scenes/${firstScene.id}`} className={openLink}>
                                                Continue <ArrowRight className="size-4" />
                                            </Link>
                                        ) : null}
                                        <Link href={`/dashboard/projects/${project.id}`} className={firstScene ? quietLink : openLink}>
                                            {firstScene ? "All scenes" : "Add the first scene"}
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
