"use client"

import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import { Camera, Film, ImagePlus, Images, Link2, Loader2, Lock, X } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET } from "@/core/validation/media-reference"
import { FRAME_INFLUENCES, frameCapability, type ShotFrame, type ShotFrames } from "@/core/validation/shot-frames"
import { getGalleryAssets, type GalleryAsset } from "@/core/actions/gallery"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/interface/components/ui/dialog"
import { captureVideoFrame, fetchImageBlob, formatTimestamp, sameOriginMediaUrl, uploadFrameImage } from "./frame-capture"

type FrameSlot = "start" | "end"

export type CaptureSource = {
  url: string
  /** Current playhead of the on-screen player, in seconds. */
  currentTime: () => number
  shotId?: string | null
  label: string
}

const SOURCE_LABELS: Record<ShotFrame["sourceType"], string> = {
  upload: "Uploaded",
  gallery: "From gallery",
  capture: "Captured",
  previous_shot: "From previous shot",
}

/**
 * Start / End Frame controls. Additive to Media references: nothing here reads
 * or changes the Image / Video / Audio reference list.
 */
export function ShotFramesPanel({ frames, onChange, modelFamilyId, modelLabel, captureSource, disabled = false, onBusy }: {
  frames: ShotFrames
  onChange: (next: ShotFrames) => void
  modelFamilyId: string
  modelLabel: string
  captureSource: CaptureSource | null
  disabled?: boolean
  onBusy?: (busy: boolean) => void
}) {
  const [busySlot, setBusySlot] = useState<FrameSlot | null>(null)
  const [error, setError] = useState("")
  const [pickerSlot, setPickerSlot] = useState<FrameSlot | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingSlot = useRef<FrameSlot>("start")
  const capability = frameCapability(modelFamilyId)
  useEffect(() => { onBusy?.(Boolean(busySlot)); return () => onBusy?.(false) }, [busySlot, onBusy])

  async function store(slot: FrameSlot, blob: Blob, meta: Pick<ShotFrame, "name" | "sourceType"> & Partial<ShotFrame>) {
    setBusySlot(slot)
    setError("")
    try {
      const assetPath = await uploadFrameImage(blob)
      const frame: ShotFrame = {
        id: crypto.randomUUID(), assetPath, influence: frames[slot]?.influence ?? "medium",
        sourceShotId: null, sourceTimestampMs: null, sourceLabel: null, ...meta,
      }
      onChange({ ...frames, [slot]: frame })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add that frame.")
    } finally {
      setBusySlot(null)
    }
  }

  async function capture(slot: FrameSlot, at: number | "end", sourceType: "capture" | "previous_shot") {
    if (!captureSource) return
    setBusySlot(slot)
    setError("")
    try {
      const { blob, timestampMs } = await captureVideoFrame(captureSource.url, at)
      await store(slot, blob, {
        name: `${captureSource.label} @ ${formatTimestamp(timestampMs)}.jpg`,
        sourceType, sourceShotId: captureSource.shotId ?? null, sourceTimestampMs: timestampMs, sourceLabel: captureSource.label,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Frame capture failed.")
      setBusySlot(null)
    }
  }

  const endBlocked = capability.endRequiresStart && !frames.start && !frames.end
  return (
    <section className="space-y-3 rounded-2xl border border-gold-400/[0.14] bg-[linear-gradient(180deg,rgba(217,192,138,0.05),transparent_45%)] p-3.5" aria-label="Start and End Frames">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80">Start / End Frame</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#8f9086]">Optional. Pin where the shot begins and where it lands. Your media references stay as they are.</p>
        </div>
        <span className="rounded-full border border-gold-400/15 px-2 py-0.5 text-[10px] text-[#a3a59a]">{modelLabel}: {capability.start ? (capability.endRequiresStart ? "start, or start + end" : "start and/or end") : "frames unavailable"}</span>
      </header>

      {!capability.start ? (
        <p className="rounded-xl border border-dashed border-gold-400/20 px-3 py-3 text-[11px] text-[#a3a59a]">{capability.note}</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {(["start", "end"] as const).map((slot) => (
            <FrameSlotCard
              key={slot}
              slot={slot}
              frame={frames[slot] ?? null}
              busy={busySlot === slot}
              disabled={disabled || Boolean(busySlot)}
              unavailableReason={slot === "end" && endBlocked ? "Add a Start Frame first. " + capability.note : null}
              orphaned={slot === "end" && Boolean(frames.end) && !frames.start && capability.endRequiresStart}
              canCapture={Boolean(captureSource)}
              onUpload={() => { pendingSlot.current = slot; fileInput.current?.click() }}
              onCapture={() => void capture(slot, captureSource ? captureSource.currentTime() : 0, "capture")}
              onSelect={() => setPickerSlot(slot)}
              onRemove={() => onChange({ ...frames, [slot]: null })}
              onInfluence={(influence) => frames[slot] && onChange({ ...frames, [slot]: { ...frames[slot]!, influence } })}
            />
          ))}
        </div>
      )}

      {capability.start && captureSource ? (
        <button
          type="button"
          disabled={disabled || Boolean(busySlot)}
          onClick={() => void capture("start", "end", "previous_shot")}
          className="inline-flex items-center gap-1.5 rounded-full border border-gold-400/25 px-3 py-1.5 text-[11px] text-gold-100 transition hover:border-gold-300/60 hover:bg-gold-400/10 disabled:opacity-40"
        >
          <Link2 className="h-3 w-3" /> Use last frame of current clip as next Start Frame
        </button>
      ) : null}

      {capability.start ? (
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">Transition direction</span>
          <input
            value={frames.transitionDirection ?? ""}
            maxLength={300}
            disabled={disabled}
            onChange={(event) => onChange({ ...frames, transitionDirection: event.target.value })}
            placeholder="e.g. slowly turns toward camera as the lights come up"
            className="mt-1 h-9 w-full rounded-xl border px-3 text-[12px]"
          />
        </label>
      ) : null}

      <p className="text-[10px] leading-relaxed text-[#77796f]">Frame influence is a director instruction; these models do not expose a frame-strength control. Frames are checked before any generation is charged.</p>
      {error ? <p role="alert" className="rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-3 py-2 text-[11px] text-amber-100">{error}</p> : null}

      <input
        ref={fileInput}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload frame image"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void store(pendingSlot.current, file, { name: file.name.slice(0, 180), sourceType: "upload" })
        }}
      />

      <GalleryFramePicker
        // Remount per open so each visit starts from a fresh gallery list.
        key={pickerSlot ?? "closed"}
        slot={pickerSlot}
        onClose={() => setPickerSlot(null)}
        onPick={async (slot, asset, atSeconds) => {
          setPickerSlot(null)
          setBusySlot(slot)
          setError("")
          try {
            const blob = asset.type === "video" ? (await captureVideoFrame(asset.url, atSeconds)).blob : await fetchImageBlob(asset.url)
            await store(slot, blob, {
              name: `${(asset.shotName || "Gallery frame").slice(0, 150)}.jpg`, sourceType: "gallery",
              sourceShotId: asset.shotId ?? null, sourceTimestampMs: asset.type === "video" ? Math.round(atSeconds * 1000) : null,
              sourceLabel: asset.shotName || null,
            })
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not use that gallery item.")
            setBusySlot(null)
          }
        }}
      />
    </section>
  )
}

function FrameSlotCard({ slot, frame, busy, disabled, unavailableReason, orphaned, canCapture, onUpload, onCapture, onSelect, onRemove, onInfluence }: {
  slot: FrameSlot
  frame: ShotFrame | null
  busy: boolean
  disabled: boolean
  unavailableReason: string | null
  orphaned: boolean
  canCapture: boolean
  onUpload: () => void
  onCapture: () => void
  onSelect: () => void
  onRemove: () => void
  onInfluence: (influence: ShotFrame["influence"]) => void
}) {
  const label = slot === "start" ? "Start Frame" : "End Frame"
  const hint = slot === "start" ? "Shot time 0" : "Where the shot lands"
  return (
    <div className={`overflow-hidden rounded-xl border transition-colors ${frame ? "border-gold-300/40 bg-gold-400/[0.04]" : "border-gold-400/[0.12] bg-white/[0.02]"} ${orphaned ? "!border-amber-300/50" : ""}`}>
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="text-[11px] font-medium text-[#e8e2d2]">{label}</span>
        <span className="text-[9.5px] uppercase tracking-[0.16em] text-[#77796f]">{hint}</span>
      </div>
      <div className="relative mx-3 mt-2 aspect-video overflow-hidden rounded-lg bg-obsidian-900">
        {busy ? (
          <div className="lux-shimmer absolute inset-0 grid place-items-center"><Loader2 className="relative z-10 h-4 w-4 animate-spin text-gold-300" /></div>
        ) : frame ? (
          <>
            <FramePreview assetPath={frame.assetPath} alt={`${label}: ${frame.name}`} />
            <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${label}`} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur transition hover:text-white">
              <X className="h-3 w-3" />
            </button>
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[9.5px] text-gold-100 backdrop-blur">
              {SOURCE_LABELS[frame.sourceType]}{frame.sourceTimestampMs != null ? ` · ${formatTimestamp(frame.sourceTimestampMs)}` : ""}
            </span>
          </>
        ) : unavailableReason ? (
          <div className="absolute inset-0 grid place-items-center px-3 text-center text-[10.5px] leading-snug text-[#8f9086]"><span><Lock className="mx-auto mb-1 h-3.5 w-3.5 text-gold-400/50" />{unavailableReason}</span></div>
        ) : (
          <div className="absolute inset-0 grid place-items-center border border-dashed border-gold-400/15 text-[10px] uppercase tracking-[0.2em] text-[#77796f]">Empty</div>
        )}
      </div>
      {orphaned ? <p className="mx-3 mt-2 text-[10.5px] text-amber-100">This End Frame needs a Start Frame before you generate.</p> : null}
      {frame?.sourceType === "previous_shot" && frame.sourceLabel ? <p className="mx-3 mt-1.5 truncate text-[10px] text-[#8f9086]">Chained from {frame.sourceLabel}</p> : null}
      <div className="flex flex-wrap gap-1.5 p-3">
        {frame ? (
          <div role="radiogroup" aria-label={`${label} influence`} className="flex w-full rounded-lg border border-gold-400/[0.12] bg-black/20 p-0.5">
            {FRAME_INFLUENCES.map((influence) => (
              <button key={influence} type="button" role="radio" aria-checked={frame.influence === influence} disabled={disabled} onClick={() => onInfluence(influence)}
                className={`flex-1 rounded-md py-1 text-[10.5px] capitalize transition ${frame.influence === influence ? "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] font-semibold text-[#1a160e]" : "text-[#a3a59a] hover:text-gold-100"}`}>
                {influence}
              </button>
            ))}
          </div>
        ) : null}
        <FrameAction icon={<ImagePlus className="h-3 w-3" />} label={frame ? "Replace" : "Add"} onClick={onUpload} disabled={disabled || Boolean(unavailableReason)} />
        <FrameAction icon={<Camera className="h-3 w-3" />} label="Capture" onClick={onCapture} disabled={disabled || Boolean(unavailableReason) || !canCapture} title={canCapture ? "Capture the current frame of the clip in the screening room" : "Generate or open a clip first to capture from it"} />
        <FrameAction icon={<Images className="h-3 w-3" />} label="Select" onClick={onSelect} disabled={disabled || Boolean(unavailableReason)} title="Select from your gallery" />
      </div>
    </div>
  )
}

function FrameAction({ icon, label, onClick, disabled, title }: { icon: React.ReactNode; label: string; onClick: () => void; disabled: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-gold-400/15 px-2 py-1.5 text-[11px] text-[#d4cfc0] transition hover:border-gold-400/45 hover:bg-gold-400/[0.08] hover:text-gold-50 disabled:pointer-events-none disabled:opacity-35">
      {icon}{label}
    </button>
  )
}

function FramePreview({ assetPath, alt }: { assetPath: string; alt: string }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    let cancelled = false
    void createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(assetPath, 3600).then(({ data }) => { if (!cancelled && data) setUrl(data.signedUrl) })
    return () => { cancelled = true }
  }, [assetPath])
  // Private signed URLs must not pass through the image optimizer cache.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" /> : <div className="lux-shimmer absolute inset-0" />
}

function GalleryFramePicker({ slot, onClose, onPick }: {
  slot: FrameSlot | null
  onClose: () => void
  onPick: (slot: FrameSlot, asset: GalleryAsset, atSeconds: number) => void
}) {
  const [assets, setAssets] = useState<GalleryAsset[] | null>(null)
  const [selected, setSelected] = useState<GalleryAsset | null>(null)
  const [time, setTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!slot) return
    let cancelled = false
    void getGalleryAssets().then((result) => { if (!cancelled) setAssets((result.data || []).slice(0, 60)) }).catch(() => { if (!cancelled) setAssets([]) })
    return () => { cancelled = true }
  }, [slot])
  return (
    <Dialog open={Boolean(slot)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl text-white">
        <DialogTitle>Select a {slot === "end" ? "End" : "Start"} Frame</DialogTitle>
        <DialogDescription className="text-[#a3a59a]">Pick an image, or a moment from one of your videos.</DialogDescription>
        {selected?.type === "video" ? (
          <div className="space-y-3">
            <video ref={videoRef} src={sameOriginMediaUrl(selected.url)} controls playsInline className="aspect-video w-full rounded-xl bg-black" onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onSeeked={(event) => setTime(event.currentTarget.currentTime)} />
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-[#a3a59a] hover:text-gold-100">← Back to gallery</button>
              <button type="button" onClick={() => slot && onPick(slot, selected, time)} className="workspace-primary-link">
                <Film size={14} /> Use frame at {time.toFixed(1)}s
              </button>
            </div>
          </div>
        ) : assets === null ? (
          <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="lux-shimmer aspect-video rounded-lg" />)}</div>
        ) : assets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gold-400/20 py-8 text-center text-sm text-[#8f9086]">Your gallery is empty. Generate or save a clip first.</p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {assets.map((asset) => (
              <button key={asset.id} type="button" onClick={() => asset.type === "video" ? setSelected(asset) : slot && onPick(slot, asset, 0)}
                className="group relative aspect-video overflow-hidden rounded-lg border border-gold-400/[0.12] bg-black text-left transition hover:border-gold-300/50">
                {asset.type === "video"
                  ? <video src={sameOriginMediaUrl(asset.url)} muted preload="metadata" className="h-full w-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src={asset.url} alt={asset.shotName} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4 text-[10px] text-white/85">{asset.type === "video" ? "▶ " : ""}{asset.shotName}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
