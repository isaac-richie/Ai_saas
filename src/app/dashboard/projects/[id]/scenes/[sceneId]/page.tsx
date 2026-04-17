import { getShots } from "@/core/actions/shots";
import { getActiveGenerationProvider } from "@/core/actions/generation";
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
    const providerResult = await getActiveGenerationProvider();
    const shots = shotsResult.data || [];
    const sequences = sequencesResult.data || [];
    const providerLabel = providerResult.data?.slug
        ? providerResult.data.slug === "openai"
            ? "OpenAI"
            : providerResult.data.slug === "kie"
                ? "Flux (Kie.ai)"
                : "Runway"
        : "Not configured";
    const providerSourceLabel =
        providerResult.data?.source === "env"
            ? "System key"
            : providerResult.data?.source === "user_key"
                ? "Your key"
                : "No key";

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6 py-2 md:py-3">
            <section data-reveal="hero" className="rounded-3xl border border-white/10 bg-[#0b0b0d] p-5 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] md:p-6">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <Badge className="mb-3 rounded-full border border-white/10 bg-white/10 text-white/90">Scene Builder</Badge>
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Compose your shot sequence</h1>
                        <p className="mt-2 max-w-2xl text-sm text-white/50 md:text-base">
                            Define camera language, generate visuals, and iterate quickly with cinematic consistency.
                        </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/50">
                        <div>Project: {params.id}</div>
                        <div>Scene: {params.sceneId}</div>
                    </div>
                </div>

                <div className="mt-8 grid gap-8 xl:grid-cols-3 min-w-0">
                    <section data-reveal="card" className="space-y-8 xl:col-span-2 min-w-0">
                    <div>
                        <div className="mb-3 flex items-center justify-between gap-2">
                            <h2 className="text-lg font-semibold">New Shot</h2>
                            <Badge
                                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] text-white/90"
                            >
                                Active Provider: {providerLabel} ({providerSourceLabel})
                            </Badge>
                        </div>
                        <ShotBuilder projectId={params.id} sceneId={params.sceneId} />
                    </div>

                    <div>
                        <h2 className="mb-3 text-lg font-semibold">Shot List ({shots.length})</h2>
                        <ShotList projectId={params.id} sceneId={params.sceneId} shots={shots} sequences={sequences} />
                    </div>
                </section>

                <aside data-reveal="card" className="space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-4 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/55">Workflow</h3>
                        <ol className="mt-3 space-y-2 text-sm text-white/55">
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">1</span>
                                Project → Scene → Shot
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">2</span>
                                Add references + confirm prompt
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">3</span>
                                Generate → Approve → Animate
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/70">4</span>
                                Add to sequence → Export
                            </li>
                        </ol>
                    </div>

                    <ElementUpload projectId={params.id} />

                    <div className="rounded-2xl border border-white/10 bg-[#0b0b0d] p-4 text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
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
