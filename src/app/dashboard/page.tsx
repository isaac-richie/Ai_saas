import { getProjects } from "@/core/actions/projects";
import { CreateProjectDialog } from "@/interface/components/dashboard/CreateProjectDialog";
import { ProjectList } from "@/interface/components/dashboard/ProjectList";
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card";
import { Badge } from "@/interface/components/ui/badge";
import { NewUserChecklist } from "@/interface/components/onboarding/NewUserChecklist";
import { StartTourButton } from "@/interface/components/onboarding/StartTourButton";
import { Clapperboard, FolderKanban, Sparkles } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Dashboard | AI Cinematography Dashboard",
};

export default async function DashboardPage() {
    const result = await getProjects();
    const projects = result.data || [];
    const activeCount = projects.filter((project) => project.status === "active").length;
    const totalScenes = projects.reduce((sum, project) => sum + (project.scene_count ?? 0), 0);
    const hasGeneratedAsset = projects.some((project) => (project.shot_count ?? 0) > 0);

    return (
        <div className="mx-auto w-full max-w-7xl space-y-5 py-2 md:py-3">
            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <Card data-reveal="hero" className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_24px_50px_-38px_rgba(0,0,0,0.95)]">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute -left-24 -top-14 h-60 w-60 rounded-full bg-[#d9a066]/15 blur-[80px]" />
                        <div className="absolute -right-20 top-1/3 h-60 w-60 rounded-full bg-[#6e8a8f]/10 blur-[90px]" />
                        <div className="data-grid-bg absolute inset-0 opacity-[0.22]" />
                    </div>
                    <div className="relative p-5 md:p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                            <div className="space-y-2">
                                <Badge className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white/90">
                                    Director Console
                                </Badge>
                                <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Build cinematic scenes faster</h1>
                                <p className="max-w-2xl text-sm text-white/50 md:text-base">
                                    Plan, prompt, and generate shots from one workspace tuned for production workflows.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">1. Create project</span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">2. Add scenes</span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">3. Generate shots</span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">4. Approve + export</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <CreateProjectDialog />
                                <Link
                                    href="/dashboard/fast-video"
                                    className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
                                >
                                    Open Fast Track
                                </Link>
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="grid gap-4">
                    <Card data-reveal="hero" className="rounded-3xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-sm font-medium text-white/55">Projects</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-end justify-between">
                            <p className="text-3xl font-semibold">{projects.length}</p>
                            <FolderKanban className="h-5 w-5 text-white/45" />
                        </CardContent>
                    </Card>
                    <Card data-reveal="hero" className="rounded-3xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                        <CardHeader className="pb-1">
                            <CardTitle className="text-sm font-medium text-white/55">Active Productions</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-end justify-between">
                            <p className="text-3xl font-semibold">{activeCount}</p>
                            <Clapperboard className="h-5 w-5 text-white/45" />
                        </CardContent>
                    </Card>
                    <Card data-reveal="hero" className="rounded-3xl border border-white/10 bg-[#0f1012] text-white shadow-[0_20px_38px_-34px_rgba(0,0,0,0.9)]">
                        <CardContent className="flex items-center gap-3 py-4 text-sm text-white/50">
                            <Sparkles className="h-4 w-4 text-white/45" />
                            Tip: build scene templates to speed up shot consistency.
                        </CardContent>
                    </Card>
                </div>
            </section>

            <section id="projects" data-reveal="card" className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Recent Projects</h2>
                </div>
                <ProjectList projects={projects} />
            </section>

            <NewUserChecklist projectCount={projects.length} sceneCount={totalScenes} hasGeneratedAsset={hasGeneratedAsset} />

            <section data-reveal="card" className="rounded-2xl border border-white/10 bg-[#0f1012] p-4 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.16em] text-white/45">User Education</p>
                        <h3 className="mt-1 text-base font-semibold">Quick Start Guide</h3>
                    </div>
                    <StartTourButton />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <Link href="/dashboard/studio" className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 hover:bg-white/10">
                        1. Build shot specs in Studio
                    </Link>
                    <Link href="/dashboard/fast-video" className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 hover:bg-white/10">
                        2. Generate direct clips in Fast Video
                    </Link>
                    <Link href="/dashboard/gallery" className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80 hover:bg-white/10">
                        3. Review, compare, and export from Gallery
                    </Link>
                </div>
            </section>
        </div>
    );
}
