import { getProjectById } from "@/core/actions/projects";
import { getSceneCovers, getScenes } from "@/core/actions/scenes";
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
import { WorkspaceHeading } from "@/interface/components/layout/WorkspaceHeading";
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
                        <Link href="/dashboard/projects" className="inline-flex rounded-xl border border-line bg-white/10 px-4 py-2 text-sm text-white hover:bg-gold-400/[0.12] hover:text-gold-50">
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
    const covers = await getSceneCovers(scenes.map((scene) => scene.id));
    const sceneCount = scenes.length;
    const shotCount = scenes.reduce((total, scene) => {
        const count = (scene as { shots?: { count: number }[] }).shots?.[0]?.count ?? 0;
        return total + count;
    }, 0);
    const assets: MediaAsset[] = [];

    const updated = new Date(project.updated_at || project.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    const tabTrigger = "rounded-full px-4 text-[13px] text-[#9aa1ab] transition-colors duration-300 hover:text-white data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-none";

    return (
        <div className="workspace-page">
            <WorkspaceHeading
                label="PROJECT"
                crumbs={[{ label: "Studio", href: "/dashboard/studio" }]}
                title={project.name}
                description={project.description || "Your film, scene by scene. Open a scene to build its shots, or add the next one."}
                actions={
                    <>
                        <Link href={`/dashboard/gallery?projectId=${project.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-line px-4 text-[13px] text-[#ece6d6] transition hover:border-line-strong hover:bg-white/[0.03]">
                            My videos
                        </Link>
                        <CreateSceneDialog projectId={project.id} />
                    </>
                }
            />

            <Tabs defaultValue="scenes" className="w-full" data-reveal="card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <TabsList className="h-10 rounded-full border border-line bg-white/[0.02] p-1">
                        <TabsTrigger value="scenes" className={tabTrigger}>Scenes</TabsTrigger>
                        <TabsTrigger value="assets" className={tabTrigger}>References & media</TabsTrigger>
                    </TabsList>
                    <p className="text-[13px] text-[#9aa1ab]">
                        {sceneCount} scene{sceneCount === 1 ? "" : "s"} · {shotCount} shot{shotCount === 1 ? "" : "s"} · Updated {updated}
                    </p>
                </div>

                <TabsContent value="scenes" className="mt-5 space-y-5">
                    {scenes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-[22px] border border-line bg-white/[0.015] px-6 py-14 text-center">
                            <p className="text-xl font-light tracking-[-0.03em] text-[#f6f1e4]">No scenes yet</p>
                            <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[#9aa1ab]">Add a scene for each place or moment in your story. You&rsquo;ll build its shots inside.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {scenes.map((scene, index) => (
                                <SceneCard
                                    key={scene.id}
                                    scene={scene}
                                    projectId={project.id}
                                    coverUrl={covers[scene.id]}
                                    isFirst={index === 0}
                                    isLast={index === scenes.length - 1}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="assets" className="mt-5">
                    <div className="space-y-8">
                        <section>
                            <ElementUpload projectId={project.id} />
                            <div className="mt-4">
                                <ElementList projectId={project.id} />
                            </div>
                        </section>
                        <section>
                            <h2 className="mb-4 text-[15px] font-medium text-[#f3eee2]">Generated media</h2>
                            <MediaGallery assets={assets} />
                        </section>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    )
}
