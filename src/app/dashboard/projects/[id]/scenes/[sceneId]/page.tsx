import { getShots } from "@/core/actions/shots";
import { getProjectById } from "@/core/actions/projects";
import { getScenes } from "@/core/actions/scenes";
import { Check } from "lucide-react";
import { getSequences } from "@/core/actions/sequences";
import { ShotBuilder } from "@/interface/components/shots/ShotBuilder";
import { ShotList } from "@/interface/components/shots/ShotList";
import { ElementUpload } from "@/interface/components/shots/ElementUpload";
import { SequenceList } from "@/interface/components/sequences/SequenceList";
import { Metadata } from "next";
import { WorkspaceHeading } from "@/interface/components/layout/WorkspaceHeading";

// Server actions on this page (image generation) can wait on a provider.
export const maxDuration = 300;

export const metadata: Metadata = {
    title: "Scene",
};

interface ScenePageProps {
    params: Promise<{
        id: string;
        sceneId: string;
    }>;
}

export default async function ScenePage(props: ScenePageProps) {
    const params = await props.params;
    const shotsResult = await getShots(params.sceneId);
    const sequencesResult = await getSequences(params.sceneId);
    const [projectResult, scenesResult] = await Promise.all([getProjectById(params.id), getScenes(params.id)]);
    const shots = shotsResult.data || [];
    const sequences = sequencesResult.data || [];
    const projectName = projectResult.data?.name || "Project";
    const sceneName = (scenesResult.data || []).find((scene: { id: string }) => scene.id === params.sceneId)?.name || "Scene";
    // Live progress: each step ticks off from what already exists in this scene.
    const options = shots.flatMap((shot: { options?: { status?: string | null; output_url?: string | null }[] }) => shot.options || []);
    const steps = [
        { label: "Add a shot", done: shots.length > 0 },
        { label: "Generate takes", done: options.some((opt) => opt.status === "completed" || opt.status === "approved") },
        { label: "Approve, then animate", done: options.some((opt) => opt.status === "approved") && options.some((opt) => /\.mp4($|\?)/i.test(opt.output_url || "")) },
        { label: "Sequence and export", done: sequences.length > 0 },
    ];
    const currentStep = steps.findIndex((step) => !step.done);

    const panel = "rounded-2xl border border-line bg-white/[0.02] p-5 text-white";

    return (
        <div className="workspace-page">
            <WorkspaceHeading
                label="SCENE"
                crumbs={[{ label: "Studio", href: "/dashboard/studio" }, { label: projectName, href: `/dashboard/projects/${params.id}` }]}
                title={sceneName}
                description="Describe each shot, choose the best image, then bring it to life."
            />

            <div className="grid min-w-0 gap-8 xl:grid-cols-3">
                <section data-reveal="card" className="min-w-0 space-y-10 xl:col-span-2">
                    <ShotBuilder projectId={params.id} sceneId={params.sceneId} shots={shots} sequences={sequences} />

                    <div>
                        <h2 className="text-[17px] font-medium text-[#f3eee2]">Shot list <span className="font-normal text-[#9aa1ab]">{shots.length}</span></h2>
                        <p className="mb-4 mt-1 text-[13px] text-[#9aa1ab]">Every shot and experiment in this scene. Only what you add to a sequence goes into the final cut.</p>
                        <ShotList projectId={params.id} sceneId={params.sceneId} shots={shots} sequences={sequences} />
                    </div>
                </section>

                <aside data-reveal="card" className="space-y-4">
                    <div className={panel}>
                        <h2 className="text-[15px] font-medium text-[#f3eee2]">Your progress</h2>
                        <ol className="mt-4 space-y-3 text-[14px]">
                            {steps.map((step, index) => (
                                <li key={step.label} className={`flex items-center gap-3 ${step.done ? "text-[#9aa1ab]" : index === currentStep ? "text-[#f3eee2]" : "text-[#9aa1ab]"}`}>
                                    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] ${
                                        step.done ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" : index === currentStep ? "border-gold-300/60 text-gold-100" : "border-line text-[#9aa1ab]"
                                    }`}>
                                        {step.done ? <Check className="size-3.5" /> : index + 1}
                                    </span>
                                    <span className={step.done ? "line-through decoration-white/20" : undefined}>{step.label}</span>
                                    {index === currentStep ? <span className="ml-auto rounded-full bg-gold-400/[0.1] px-2 py-0.5 text-[11.5px] text-gold-200">Next</span> : null}
                                </li>
                            ))}
                        </ol>
                    </div>

                    <ElementUpload projectId={params.id} />

                    <div className={panel}>
                        <h2 className="text-[15px] font-medium text-[#f3eee2]">Sequences</h2>
                        <div className="mt-3">
                            <SequenceList sequences={sequences} />
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}
