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
                <section className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-6 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                    <h1 className="text-xl font-semibold">Project unavailable</h1>
                    <p className="mt-2 text-sm text-white/55">
                        This can happen when the session is still initializing in build mode. Try again from the projects list.
                    </p>
                    <div className="mt-4">
                        <Link href="/dashboard/projects" className="inline-flex rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15">
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
            <section data-reveal="hero" className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Project Workspace</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{project.name}</h1>
                        <p className="mt-2 text-sm text-white/50 md:text-base">
                            {project.description || "Project workspace for scenes, prompts, and generated outputs."}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/55">
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Scenes {sceneCount}</span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Shots {shotCount}</span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                                Updated {new Date(project.updated_at || project.created_at).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Link href={scenes[0] ? `/dashboard/projects/${project.id}/scenes/${scenes[0].id}` : `/dashboard/projects/${project.id}`} className="rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-xs text-white hover:bg-white/15">
                            Open Studio
                        </Link>
                        <Link href={`/dashboard/gallery?projectId=${project.id}`} className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs text-white/90 hover:bg-white/10">
                            Open Gallery
                        </Link>
                        <CreateSceneDialog projectId={project.id} />
                    </div>
                </div>

                <Tabs defaultValue="scenes" className="mt-8 w-full" data-reveal="card">
                <TabsList className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-1">
                    <TabsTrigger value="scenes" className="rounded-xl text-white data-[state=active]:bg-white/10 data-[state=active]:text-white">Scenes</TabsTrigger>
                    <TabsTrigger value="assets" className="rounded-xl text-white data-[state=active]:bg-white/10 data-[state=active]:text-white">Asset Library</TabsTrigger>
                </TabsList>

                <TabsContent value="scenes" className="mt-4 space-y-5">
                    {scenes.length === 0 ? (
                        <div className="flex h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] text-center text-white">
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
