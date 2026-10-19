"use client"

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react"
import { ImagePlus, Loader2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { MentionTextarea, type MentionReference } from "./MentionTextarea"
import { normalizeReferenceImage } from "./normalize-image"

const MAX_IMAGES = 4

/**
 * "Request a corrected take": what is visibly wrong, in words (with @-tags for the film's references)
 * and, optionally, up to four images showing the intended fix. The correction supervisor sees both.
 */
export function CorrectionBox({ note, onNote, references, busy, onSubmit }: {
  note: string
  onNote: (value: string) => void
  references: MentionReference[]
  busy?: boolean
  onSubmit: (imageUrls: string[]) => void
}) {
  const [images, setImages] = useState<{ url: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  async function add(files: File[]) {
    const room = MAX_IMAGES - images.length
    if (room <= 0) { toast.error(`Up to ${MAX_IMAGES} images per correction.`); return }
    setUploading(true)
    try {
      for (const picked of files.slice(0, room)) {
        const file = await normalizeReferenceImage(picked)
        const body = new FormData(); body.set("file", file)
        const response = await fetch("/api/upload", { method: "POST", body })
        const result = await response.json().catch(() => null)
        if (!response.ok || !result?.url) throw new Error(result?.error || `${picked.name} didn't upload. Try again.`)
        setImages((current) => [...current, { url: result.url, name: picked.name }])
      }
      if (files.length > room) toast.message(`Only ${room} more image${room === 1 ? "" : "s"} fit.`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Couldn't add that image.")
    } finally {
      setUploading(false)
      if (picker.current) picker.current.value = ""
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-gold-400/[0.16] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3.5">
      <p className="text-[13px] font-medium text-[#ece6d6]">Request a corrected take</p>
      <MentionTextarea
        value={note}
        onChange={onNote}
        references={references}
        emptyHint="No film references to tag. Attach an image below to show the fix."
        maxLength={4000}
        placeholder="Describe only what is visibly wrong: motion, continuity, framing, lighting… Type @ to point at a reference."
        className="min-h-24 w-full rounded-xl border border-white/[0.08] bg-black/35 p-3 text-[14px] leading-relaxed text-white placeholder:text-white/35 focus:border-gold-400/45 md:text-[13px]"
      />
      {images.length ? (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <figure key={image.url} className="group relative size-16 overflow-hidden rounded-xl border border-gold-400/25">
              <img src={image.url} alt={`Fix reference ${index + 1}`} className="size-full object-cover" />
              <span className="absolute bottom-0.5 left-0.5 rounded-md bg-black/70 px-1 text-[9.5px] text-gold-100">Fix {index + 1}</span>
              <button type="button" aria-label={`Remove ${image.name}`} onClick={() => setImages((current) => current.filter((item) => item.url !== image.url))} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/70 text-white/90 hover:text-rose-200">
                <X className="size-3" />
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={picker} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(event) => void add(Array.from(event.target.files || []))} />
        <button
          type="button"
          disabled={uploading || busy || images.length >= MAX_IMAGES}
          onClick={() => picker.current?.click()}
          className="flex h-10 items-center gap-2 rounded-xl border border-gold-400/25 bg-white/[0.03] px-3.5 text-[13px] text-gold-100 transition hover:border-gold-400/50 hover:bg-gold-400/[0.08] disabled:opacity-40"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {uploading ? "Adding…" : `Add image${images.length ? ` (${images.length}/${MAX_IMAGES})` : ""}`}
        </button>
        <button
          type="button"
          disabled={busy || uploading || note.trim().length < 3}
          onClick={() => onSubmit(images.map((image) => image.url))}
          className="ml-auto flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] px-4 text-[13px] font-semibold text-[#1a160e] shadow-[0_10px_26px_-14px_rgba(217,192,138,0.9)] transition hover:brightness-105 disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Ask correction supervisor
        </button>
      </div>
    </div>
  )
}
