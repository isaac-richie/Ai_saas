import { getShots } from "@/core/actions/shots";
import { getProjectById } from "@/core/actions/projects";
import { getScenes } from "@/core/actions/scenes";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { getSequences } from "@/core/actions/sequences";
import { ShotBuilder } from "@/interface/components/shots/ShotBuilder";
import { ShotList } from "@/interface/components/shots/ShotList";
import { ElementUpload } from "@/interface/components/shots/ElementUpload";
import { SequenceList } from "@/interface/components/sequences/SequenceList";
import { Metadata } from "next";
import { Badge } from "@/interface/components/ui/badge";

export const metadata: Metadata = {
    title: "Scene Builder | AI Cinematography Dashboard",
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

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 py-2 md:py-3">
            <section data-reveal="hero" className="rounded-3xl lux-glass lux-hairline p-5 text-white md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-gold-400/25 bg-gold-400/[0.07] px-3 text-[10px] font-medium uppercase tracking-[0.22em] text-gold-200">Scene Builder</Badge>
                        <h1 className="text-3xl font-light tracking-[-0.04em] text-[#f6f1e4] md:text-[42px] md:leading-[1.08]">Compose your shot sequence</h1>
                        <p className="mt-2 max-w-2xl text-sm text-white/50 md:text-base">
                            Define camera language, generate visuals, and iterate quickly with cinematic consistency.
                        </p>
                    </div>
<nav aria-label="Breadcrumb" className="flex items-center gap-1.5 rounded-full border border-gold-400/[0.12] bg-white/5 px-3.5 py-1.5 text-xs text-white/55">
                        <Link href={`/dashboard/projects/${params.id}`} className="max-w-[12rem] truncate transition hover:text-gold-100">{projectName}</Link>
                        <ChevronRight className="h-3 w-3 text-white/30" />
                        <span className="max-w-[12rem] truncate text-[#f1ece0]">{sceneName}</span>
                    </nav>
                </div>

                <div className="mt-8 grid gap-8 xl:grid-cols-3 min-w-0">
                    <section data-reveal="card" className="space-y-8 xl:col-span-2 min-w-0">
                    <div>
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="text-lg font-semibold">New Shot</h2>

                        </div>
                        <ShotBuilder projectId={params.id} sceneId={params.sceneId} />
                    </div>

                    <div>
                        <h2 className="mb-3 text-lg font-semibold">Shot List ({shots.length})</h2>
                        <ShotList projectId={params.id} sceneId={params.sceneId} shots={shots} sequences={sequences} />
                    </div>
                </section>

                <aside data-reveal="card" className="space-y-4">
                    <div className="rounded-2xl lux-glass lux-hairline p-4 text-white">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/55">Your progress</h3>
                        <ol className="mt-3 space-y-2 text-sm">
                            {steps.map((step, index) => (
                                <li key={step.label} className={`flex items-center gap-2.5 ${step.done ? "text-white/45" : index === currentStep ? "text-[#f1ece0]" : "text-white/40"}`}>
                                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                                        step.done ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-200" : index === currentStep ? "border-gold-300/50 bg-gold-400/15 text-gold-100" : "border-gold-400/[0.12] bg-white/5 text-white/50"
                                    }`}>
                                        {step.done ? <Check className="h-3 w-3" /> : index + 1}
                                    </span>
                                    <span className={step.done ? "line-through decoration-white/20" : undefined}>{step.label}</span>
                                    {index === currentStep ? <span className="ml-auto text-[10px] uppercase tracking-[0.16em] text-gold-300/80">Next</span> : null}
                                </li>
                            ))}
                        </ol>
                    </div>

                    <ElementUpload projectId={params.id} />

                    <div className="rounded-2xl lux-glass lux-hairline p-4 text-white">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/55">Sequences</h3>
                        <div className="mt-3">
                            <SequenceList sequences={sequences} />
                        </div>
                    </div>
                </aside>
                </div>
            </section>
        </div>
    );
}
