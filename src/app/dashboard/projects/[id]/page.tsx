import { getProjectById } from "@/core/actions/projects";
import { getScenes } from "@/core/actions/scenes";
import { SceneCard } from "@/interface/components/dashboard/SceneCard";
import { MediaGallery, MediaAsset } from "@/interface/components/media/MediaGallery";
import { ElementUpload } from "@/interface/components/shots/ElementUpload";
import { ElementList } from "@/interface/components/shots/ElementList";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/interface/components/ui/tabs";
import { CreateSceneDialog } from "@/interface/components/dashboard/CreateSceneDialog";
import { Badge } from "@/interface/components/ui/badge";
import Link from "next/link";

interface ProjectPageProps {
    params: Promise<{
        id: string
    }>
}

export default async function ProjectPage(props: ProjectPageProps) {
    const params = await props.params;
    const projectRes = await getProjectById(params.id);
    if (projectRes.error || !projectRes.data) {
        return (
            <div className="mx-auto w-full max-w-3xl py-10">
                <section className="rounded-3xl lux-glass lux-hairline p-6 text-white">
                    <h1 className="text-xl font-semibold">Project unavailable</h1>
                    <p className="mt-2 text-sm text-white/55">
                        This can happen when the session is still initializing in build mode. Try again from the projects list.
                    </p>
                    <div className="mt-4">
                        <Link href="/dashboard/projects" className="inline-flex rounded-xl border border-gold-400/[0.12] bg-white/10 px-4 py-2 text-sm text-white hover:bg-gold-400/[0.12] hover:text-gold-50">
                            Back to Projects
                        </Link>
                    </div>
                </section>
            </div>
        )
    }

    const scenesRes = await getScenes(params.id);

    const project = projectRes.data;
    const scenes = scenesRes.data || [];
    const sceneCount = scenes.length;
    const shotCount = scenes.reduce((total, scene) => {
        const count = (scene as { shots?: { count: number }[] }).shots?.[0]?.count ?? 0;
        return total + count;
    }, 0);
    const assets: MediaAsset[] = [];

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 py-2 md:py-3">
            <section data-reveal="hero" className="rounded-3xl lux-glass lux-hairline p-5 text-white md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-gold-400/25 bg-gold-400/[0.07] px-3 text-[10px] font-medium uppercase tracking-[0.22em] text-gold-200">Project Workspace</Badge>
                        <h1 className="text-3xl font-light tracking-[-0.04em] text-[#f6f1e4] md:text-[42px] md:leading-[1.08]">{project.name}</h1>
                        <p className="mt-2 text-sm text-white/50 md:text-base">
                            {project.description || "Project workspace for scenes, prompts, and generated outputs."}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                            <span className="rounded-full border border-gold-400/[0.15] bg-gold-400/[0.04] px-3 py-1 text-gold-100/80">Scenes {sceneCount}</span>
                            <span className="rounded-full border border-gold-400/[0.15] bg-gold-400/[0.04] px-3 py-1 text-gold-100/80">Shots {shotCount}</span>
                            <span className="rounded-full border border-gold-400/[0.15] bg-gold-400/[0.04] px-3 py-1 text-gold-100/80">
                                Updated {new Date(project.updated_at || project.created_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={scenes[0] ? `/dashboard/projects/${project.id}/scenes/${scenes[0].id}` : `/dashboard/projects/${project.id}`} className="rounded-xl border border-gold-400/[0.12] bg-white/10 px-3.5 py-2 text-xs text-white hover:bg-gold-400/[0.12] hover:text-gold-50">
                            Open Studio
                        </Link>
                        <Link href={`/dashboard/gallery?projectId=${project.id}`} className="rounded-xl border border-gold-400/[0.12] bg-white/5 px-3.5 py-2 text-xs text-white/90 hover:bg-gold-400/[0.08]">
                            Open Gallery
                        </Link>
                        <CreateSceneDialog projectId={project.id} />
                    </div>
                </div>

                <Tabs defaultValue="scenes" className="mt-8 w-full" data-reveal="card">
                <TabsList className="lux-glass h-11 rounded-2xl p-1">
                    <TabsTrigger value="scenes" className="rounded-xl px-4 text-[#a3a59a] transition-all duration-300 data-[state=active]:border-gold-400/30 data-[state=active]:bg-gold-400/[0.1] data-[state=active]:text-gold-100 data-[state=active]:shadow-[0_0_24px_-10px_rgba(217,192,138,0.6)]">Scenes</TabsTrigger>
                    <TabsTrigger value="assets" className="rounded-xl px-4 text-[#a3a59a] transition-all duration-300 data-[state=active]:border-gold-400/30 data-[state=active]:bg-gold-400/[0.1] data-[state=active]:text-gold-100 data-[state=active]:shadow-[0_0_24px_-10px_rgba(217,192,138,0.6)]">Asset Library</TabsTrigger>
                </TabsList>

                <TabsContent value="scenes" className="mt-4 space-y-5">
                    {scenes.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-gold-400/20 bg-obsidian-950 text-center text-white">
                            <p className="mb-2 text-sm text-white/50">No scenes yet.</p>
                            <p className="text-xs text-white/50">Add your first scene to start composing shots.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {scenes.map((scene, index) => (
                                <SceneCard
                                    key={scene.id}
                                    scene={scene}
                                    projectId={project.id}
                                    isFirst={index === 0}
                                    isLast={index === scenes.length - 1}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="assets" className="mt-5">
                    <div className="space-y-6">
                        <section>
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/55">Reference Elements</h3>
                            <ElementUpload projectId={project.id} />
                            <div className="mt-4">
                                <ElementList projectId={project.id} />
                            </div>
                        </section>
                        <section>
                            <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/55">Generated Media</h3>
                            <MediaGallery assets={assets} />
                        </section>
                    </div>
                </TabsContent>
            </Tabs>
            </section>
        </div>
    )
}
