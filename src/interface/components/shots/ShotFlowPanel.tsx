"use client"

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Check, ListPlus, Loader2, Pencil, RotateCcw, Sparkles, Video } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/interface/components/ui/button"
import { generateShot, generateVideoShot } from "@/core/actions/generation"
import { updateShotStatus } from "@/core/actions/shots"
import { appendShotToSequence, createSequence } from "@/core/actions/sequences"
import { DEFAULT_KIE_VIDEO_MODEL_FAMILY, resolveKieVideoModelByFamily } from "@/core/config/kie-video-models"
import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET } from "@/core/validation/media-reference"
import { captureVideoFrame, uploadFrameImage } from "@/interface/components/fast-video/frame-capture"

export type FlowOption = { id: string; status: string; output_url?: string | null; prompt?: string | null; created_at: string }
export type FlowShot = { id: string; name: string; description?: string | null; options?: FlowOption[] }
export type FlowSequence = { id: string; name: string }

const isMedia = (url?: string | null) => Boolean(url && url !== "pending_generation" && (/^https?:\/\//i.test(url) || url.startsWith("/storage/")))
const isVideo = (url?: string | null) => isMedia(url) && /\.mp4($|\?)/i.test(url || "")

export type ShotStage = "empty" | "generating" | "choose" | "next" | "animating" | "video" | "failed"

/** Where a shot is in the loop: choose an image, decide what next, or review its video. */
export function shotStage(shot: FlowShot, busy: boolean): ShotStage {
  const options = shot.options ?? []
  const videos = options.filter((opt) => isVideo(opt.output_url) || (opt.status === "processing" && !isMedia(opt.output_url) && options.some((o) => o.status === "approved")))
  if (videos.some((opt) => isMedia(opt.output_url))) return "video"
  if (videos.length) return "animating"
  if (options.some((opt) => opt.status === "approved" && !isVideo(opt.output_url))) return "next"
  if (options.some((opt) => opt.status === "completed" && isMedia(opt.output_url))) return "choose"
  if (busy || options.some((opt) => opt.status === "processing")) return "generating"
  return options.some((opt) => opt.status === "failed") ? "failed" : "empty"
}

export function ShotFlowPanel({ shot, shotNumber, projectId, sceneId, sequences, referenceNames, generating = false, onEdit, onContinue }: {
  shot: FlowShot
  shotNumber: number
  projectId: string
  sceneId: string
  sequences: FlowSequence[]
  /** Names of the references this shot uses, for the plain-language summary. */
  referenceNames: string[]
  /** The builder is creating this shot's first images right now. */
  generating?: boolean
  onEdit: () => void
  onContinue: (input: { imageUrl: string; shotName: string }) => void
}) {
  const router = useRouter()
  const panelRef = useRef<HTMLElement>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | "approve" | "regenerate" | "animate" | "sequence" | "approve-video">(null)
  const options = shot.options ?? []
  const stage = shotStage(shot, busy === "regenerate" || generating)
  const images = options.filter((opt) => isMedia(opt.output_url) && !isVideo(opt.output_url) && (opt.status === "completed" || opt.status === "approved"))
  const approvedImage = options.find((opt) => opt.status === "approved" && !isVideo(opt.output_url))
  const video = [...options].filter((opt) => isVideo(opt.output_url)).sort((a, b) => (a.created_at > b.created_at ? -1 : 1))[0]
  const videoApproved = video?.status === "approved"

  // Bring each new stage into view so the next action is never hunted for.
  const firstStage = useRef(stage)
  useEffect(() => {
    if (stage === firstStage.current) return
    firstStage.current = stage
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [stage])

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<{ error?: string } | undefined | void>, success?: string) => {
    setBusy(kind)
    try {
      const result = await action()
      if (result && "error" in result && result.error) throw new Error(result.error)
      if (success) toast.success(success)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong")
    } finally {
      setBusy(null)
      router.refresh()
    }
  }

  const approve = () => {
    const id = selectedId ?? (images.length === 1 ? images[0].id : null)
    if (!id) { toast.message("Tap the image you like best first."); return }
    void run("approve", () => updateShotStatus(shot.id, id, "approved"), "Image approved. It's now the starting frame for this shot.")
  }

  const animate = () => {
    if (!approvedImage) return
    void run("animate", () => generateVideoShot(approvedImage.id, {
      customPrompt: (shot.description || approvedImage.prompt || "Cinematic motion, subtle camera move, natural lighting").slice(0, 2000),
      useSourceImage: true,
      durationSeconds: 5,
      model: resolveKieVideoModelByFamily({ familyId: DEFAULT_KIE_VIDEO_MODEL_FAMILY, useImageToVideo: true }),
    }), "Animating your approved image. Keep working; it appears here when ready.")
  }

  const addToSequence = () => void run("sequence", async () => {
    let sequenceId = sequences[0]?.id
    if (!sequenceId) {
      const created = await createSequence(projectId, sceneId, "Main sequence")
      if (created.error || !created.data) return { error: created.error || "Could not create a sequence" }
      sequenceId = created.data.id
    }
    return appendShotToSequence(sequenceId, shot.id)
  }, `Added to ${sequences[0]?.name || "Main sequence"}`)

  const [continuing, setContinuing] = useState(false)
  // From a finished video, the next shot starts where the video ends; otherwise from the approved image.
  const continueStory = async () => {
    const anchor = approvedImage?.output_url
    if (stage === "video" && video?.output_url) {
      setContinuing(true)
      try {
        const { blob } = await captureVideoFrame(`/api/media/proxy?url=${encodeURIComponent(video.output_url)}`, "end")
        const assetPath = await uploadFrameImage(blob)
        // The image model fetches this itself, so it needs a URL that outlives regenerations.
        const { data } = await createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(assetPath, 60 * 60 * 24 * 7)
        if (!data?.signedUrl) throw new Error("Could not save the last frame")
        onContinue({ imageUrl: data.signedUrl, shotName: shot.name })
        return
      } catch {
        if (!anchor) { toast.error("Couldn't read the video's last frame. Try again."); return }
        toast.message("Continuing from the approved image instead of the video's last frame.")
      } finally {
        setContinuing(false)
      }
    }
    if (!anchor) { toast.message("Approve an image first so the next shot knows where to start."); return }
    onContinue({ imageUrl: anchor, shotName: shot.name })
  }

  const stageTitle: Record<ShotStage, string> = {
    empty: "No images yet",
    generating: "Generating your images…",
    choose: "Choose your image",
    next: "What next?",
    animating: "Animating your image…",
    video: "Video ready",
    failed: "Generation failed",
  }

  return (
    <section ref={panelRef} aria-label={`Shot ${shotNumber} progress`} className="studio-card animate-in fade-in-0 slide-in-from-bottom-2 rounded-2xl p-4 text-white duration-500">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80">Shot {String(shotNumber).padStart(2, "0")} · {shot.name}</p>
          <h3 className="mt-0.5 font-serif text-xl tracking-tight text-[#f1ece0]">{stageTitle[stage]}</h3>
        </div>
        <StageDots stage={stage} />
      </header>

      {stage === "generating" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[0, 1].map((n) => <div key={n} className="aspect-video rounded-xl lux-shimmer" />)}
        </div>
      ) : null}

      {stage === "generating" ? <p className="mt-2 text-[11.5px] text-white/45">Usually under a minute. You can keep working; they appear here when ready.</p> : null}

      {stage === "empty" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-white/55">This shot hasn&apos;t been generated yet. Your prompt and references are saved.</p>
          <Button type="button" variant="studio" size="sm" onClick={() => void run("regenerate", () => generateShot(shot.id), "Generating your images")} disabled={Boolean(busy)} className="h-8">
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />Generate image
          </Button>
        </div>
      ) : null}

      {stage === "failed" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="text-[12px] text-rose-200/90">The images didn&apos;t come through. Your prompt and references are kept.</p>
          <Button type="button" variant="studio" size="sm" onClick={() => void run("regenerate", () => generateShot(shot.id))} disabled={Boolean(busy)} className="h-8">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Try again
          </Button>
        </div>
      ) : null}

      {stage === "choose" ? (
        <>
          <div role="radiogroup" aria-label="Image options" className={`mt-3 grid gap-2 ${images.length > 2 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2"}`}>
            {images.map((opt, index) => {
              const selected = selectedId === opt.id
              return (
                <button key={opt.id} type="button" role="radio" aria-checked={selected} onClick={() => setSelectedId(opt.id)}
                  className={`group relative overflow-hidden rounded-xl border-2 text-left transition ${selected ? "border-gold-300 shadow-[0_14px_30px_-18px_rgba(217,192,138,0.9)]" : "border-transparent hover:border-gold-400/40"}`}>
                  <img src={opt.output_url!} alt={`Option ${String.fromCharCode(65 + index)}`} className="aspect-video w-full object-cover" />
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10.5px] backdrop-blur ${selected ? "bg-gold-300 font-semibold text-[#1a160e]" : "bg-black/60 text-white/85"}`}>
                    {selected ? <Check className="mr-0.5 inline h-3 w-3" strokeWidth={3} /> : null}Option {String.fromCharCode(65 + index)}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="studio" onClick={approve} disabled={Boolean(busy) || (!selectedId && images.length !== 1)} className="h-10 px-5 font-semibold">
              {busy === "approve" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Approve image
            </Button>
            <Button type="button" variant="studioSecondary" onClick={() => void run("regenerate", () => generateShot(shot.id), "New options added")} disabled={Boolean(busy)} className="h-10">
              {busy === "regenerate" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-1.5 h-4 w-4" />}Regenerate
            </Button>
            <Button type="button" variant="studioGhost" onClick={onEdit} disabled={Boolean(busy)} className="h-10">
              <Pencil className="mr-1.5 h-4 w-4" />Edit shot
            </Button>
            <span className="text-[11px] text-white/40">{selectedId ? `Selected: Option ${String.fromCharCode(65 + images.findIndex((opt) => opt.id === selectedId))}` : "Tap the one you like best"}</span>
          </div>
        </>
      ) : null}

      {(stage === "next" || stage === "animating") && approvedImage ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-xl border border-emerald-300/25">
            <img src={approvedImage.output_url!} alt="Approved image" className="aspect-video w-full object-cover" />
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-400/90 px-2 py-0.5 text-[10.5px] font-semibold text-[#0f1714]"><Check className="h-3 w-3" strokeWidth={3} />Approved image</span>
            {stage === "animating" ? (
              <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
                <div className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-gold-200" /><p className="mt-2 text-[12px] text-white/80">Bringing it to life…</p></div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <ReferenceSummary names={referenceNames} />
            <Button type="button" variant="studio" onClick={animate} disabled={Boolean(busy) || stage === "animating"} className="h-10 font-semibold">
              {busy === "animate" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Video className="mr-1.5 h-4 w-4" />}Animate this image
            </Button>
            <Button type="button" variant="studioSecondary" onClick={addToSequence} disabled={Boolean(busy)} className="h-10">
              {busy === "sequence" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ListPlus className="mr-1.5 h-4 w-4" />}Add to sequence
            </Button>
            <Button type="button" variant="studioSecondary" onClick={() => void continueStory()} disabled={Boolean(busy) || continuing} className="h-10">
              <ArrowRight className="mr-1.5 h-4 w-4" />Continue to next shot
            </Button>
            <button type="button" onClick={() => void run("approve", () => updateShotStatus(shot.id, approvedImage.id, "completed"))} disabled={Boolean(busy)} className="text-left text-[11px] text-white/40 transition hover:text-white/75">
              Choose a different image
            </button>
          </div>
        </div>
      ) : null}

      {stage === "video" && video ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <video src={`/api/media/proxy?url=${encodeURIComponent(video.output_url!)}`} controls playsInline preload="metadata" className="aspect-video w-full rounded-xl border border-gold-400/20 bg-black object-contain" />
          <div className="flex flex-col gap-2">
            <ReferenceSummary names={referenceNames} />
            {!videoApproved ? (
              <Button type="button" variant="studio" onClick={() => void run("approve-video", () => updateShotStatus(shot.id, video.id, "approved"), "Video approved")} disabled={Boolean(busy)} className="h-10 font-semibold">
                {busy === "approve-video" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}Approve video
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-emerald-200"><Check className="h-3.5 w-3.5" />Video approved</span>
            )}
            <Button type="button" variant={videoApproved ? "studio" : "studioSecondary"} onClick={addToSequence} disabled={Boolean(busy)} className="h-10">
              {busy === "sequence" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ListPlus className="mr-1.5 h-4 w-4" />}Add to sequence
            </Button>
            <Button type="button" variant="studioSecondary" onClick={() => void continueStory()} disabled={Boolean(busy) || continuing} className="h-10">
              {continuing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-1.5 h-4 w-4" />}Continue to next shot
            </Button>
            <Button type="button" variant="studioGhost" onClick={animate} disabled={Boolean(busy) || !approvedImage} className="h-9 text-[12px]">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Animate again
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ReferenceSummary({ names }: { names: string[] }) {
  if (!names.length) return <p className="text-[11px] text-white/40"><Sparkles className="mr-1 inline h-3 w-3" />No references attached</p>
  return (
    <div className="flex flex-wrap items-center gap-1">
      {names.map((name) => (
        <span key={name} className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10.5px] text-emerald-50"><Check className="h-2.5 w-2.5" />{name}</span>
      ))}
    </div>
  )
}

const STAGE_ORDER: ShotStage[] = ["generating", "choose", "next", "video"]
function StageDots({ stage }: { stage: ShotStage }) {
  const position = stage === "animating" ? 2.5 : stage === "failed" || stage === "empty" ? 0 : STAGE_ORDER.indexOf(stage)
  return (
    <ol aria-hidden className="flex items-center gap-1.5 text-[10px] text-white/40">
      {["Generate", "Choose", "Animate / add", "Video"].map((label, index) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${index < position ? "bg-gold-300" : index === Math.floor(position) ? "animate-pulse bg-gold-200" : "bg-white/20"}`} />
          <span className={index === Math.floor(position) ? "text-gold-100" : undefined}>{label}</span>
          {index < 3 ? <span className="text-white/15">—</span> : null}
        </li>
      ))}
    </ol>
  )
}

