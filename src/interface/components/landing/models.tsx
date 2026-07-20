export type LandingModel = {
  id: string
  name: string
  provider: string
  description: string
  strengths: string[]
  accent: string
  border: string
  dot: string
  badge: string
}

export const MODELS: LandingModel[] = [
  {
    id: "kling",
    name: "Kling 2.5 Turbo",
    provider: "Kie.ai",
    description: "Balanced cinematic quality and reliable motion. The versatile default for most productions.",
    strengths: ["Reliable motion", "Consistent quality", "Fast renders"],
    accent: "from-cyan-400/20 to-cyan-400/5",
    border: "border-cyan-400/20 hover:border-cyan-400/35",
    dot: "bg-cyan-400",
    badge: "border-cyan-400/25 text-cyan-300 bg-cyan-400/10",
  },
  {
    id: "seedance",
    name: "Seedance 2",
    provider: "Bytedance",
    description: "Fast, punchy renders with strong stylization. Ideal for bold visual statements and quick iteration.",
    strengths: ["Speed-first", "Bold stylization", "Quick drafts"],
    accent: "from-blue-400/20 to-blue-400/5",
    border: "border-blue-400/20 hover:border-blue-400/35",
    dot: "bg-blue-400",
    badge: "border-blue-400/25 text-blue-300 bg-blue-400/10",
  },
  {
    id: "sora",
    name: "Sora 2",
    provider: "OpenAI",
    description: "High-end narrative motion and scene coherence. For when every frame needs to hold up to scrutiny.",
    strengths: ["Narrative depth", "Scene coherence", "Premium quality"],
    accent: "from-orange-400/20 to-orange-400/5",
    border: "border-orange-400/20 hover:border-orange-400/35",
    dot: "bg-orange-400",
    badge: "border-orange-400/25 text-orange-300 bg-orange-400/10",
  },
]

export function ModelCardBody({ model }: { model: LandingModel }) {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${model.dot}`} />
        <span className="text-xs font-medium text-white/50">{model.provider}</span>
      </div>

      <h3 className="mb-2 text-lg font-semibold text-white/90">{model.name}</h3>
      <p className="mb-5 text-[13px] leading-relaxed text-white/45">{model.description}</p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {model.strengths.map((s) => (
          <span key={s} className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${model.badge}`}>
            {s}
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] text-white/50">Text-to-Video</span>
        <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] text-white/50">Image-to-Video</span>
      </div>
    </>
  )
}
