"use client"

/* eslint-disable @next/next/no-img-element */
import { normalizeReferenceImage } from "./normalize-image"
import { uploadReferenceFile } from "./upload-reference"
import { useRef, useState } from "react"
import { AudioLines, ImagePlus, Loader2, LockKeyhole, RefreshCw, Sparkles, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { MAX_PRODUCTION_REFERENCES, MAX_SHOT_REFERENCES, labelProductionAssets, type ProductionAsset } from "@/core/validation/production-assets"
import styles from "./ProductionReferences.module.css"

export function ProductionReferences({ assets, onChange, disabled = false, onBusy, audio }: {
  assets: ProductionAsset[]; onChange?: (assets: ProductionAsset[]) => void | Promise<string | null | void>; disabled?: boolean; onBusy?: (busy: boolean) => void
  /** The film's audio library, once the film exists: a separate count and its own upload / create actions. */
  audio?: { count: number; aiEnabled: boolean; onOpen: (tab: "library" | "upload" | "ai") => void }
}) {
  const [uploading, setUploading] = useState(false)
  /** The card being swapped: only it shows a spinner, the Add button stays as it is. */
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [role, setRole] = useState<ProductionAsset["role"]>("character")
  const input = useRef<HTMLInputElement>(null)
  const replacementId = useRef<string | null>(null)
  const locked = !onChange
  function reportError(title: string, message: string) {
    setError(message)
    toast.error(title, { description: message })
  }
  /** Checks one file and makes it model-ready; returns the file to upload, or null after reporting why not. */
  async function prepare(file: File): Promise<{ file: File; isVideo: boolean } | null> {
    // Kling's multi-image element API accepts only JPG and PNG images, at a smaller limit than our
    // general upload endpoint. Any other photo (WebP, AVIF, HEIC where readable, oversized PNG) is
    // converted to a high-quality JPEG here, so a production never reaches render with an unusable asset.
    const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type)
    const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(file.name)
    if (!isVideo && !looksLikeImage) {
      reportError("Unsupported reference file", `${file.name} isn't an image or video. Add a photo (JPG, PNG, WebP, HEIC) or an MP4, WebM or MOV video.`); return null
    }
    if (isVideo && (file.size > 25 * 1024 * 1024 || !file.size)) {
      reportError("Video too large", `${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB. Videos must be under 25 MB; trim or export it smaller.`); return null
    }
    if (isVideo) return { file, isVideo }
    try { return { file: await normalizeReferenceImage(file), isVideo } } catch (cause) {
      reportError("Couldn't use this image", cause instanceof Error ? cause.message : "Try a JPG or PNG."); return null
    }
  }

  /** Uploads one or more files in order. A replacement swaps exactly one; new files fill free places up to the limit. */
  async function upload(picked: File[]) {
    if (!picked.length || !onChange || uploading) return
    setError("")
    const replacement = assets.find(asset => asset.id === replacementId.current)
    const room = replacement ? 1 : Math.max(0, MAX_PRODUCTION_REFERENCES - assets.length)
    const files = picked.slice(0, room)
    if (picked.length > room) toast.message(`Added the first ${room}`, { description: `A film can hold ${MAX_PRODUCTION_REFERENCES} references.` })
    setUploading(true); setReplacingId(replacement?.id ?? null); onBusy?.(true)
    let current = assets
    try {
      for (const original of files) {
        const ready = await prepare(original)
        if (!ready) continue
        try {
          const result = { url: await uploadReferenceFile(ready.file) }
          const next: ProductionAsset = {
            id: replacement?.id || crypto.randomUUID(), name: ready.file.name.slice(0, 160),
            role: replacement?.role || role, url: result.url, mediaType: ready.isVideo ? "video" : "image",
          }
          // A replacement keeps its tag; a new file takes the next free @image/@video number.
          current = labelProductionAssets(replacement ? current.map(asset => asset.id === replacement.id ? { ...next, label: replacement.label } : asset) : [...current, next])
          // A saved film stores the change on the server; it may refuse (for example once takes exist).
          const refused = await onChange(current)
          if (typeof refused === "string") throw new Error(refused)
          if (replacement) toast.success(`${replacement.label ?? "Reference"} replaced`, { description: "New shots will use the new image. The tag stays the same." })
        } catch (cause) { reportError(replacement ? "Couldn't replace this reference" : "Reference upload failed", `${original.name}: ${cause instanceof Error ? cause.message : "Upload failed"}`); if (replacement) break }
      }
    } finally { replacementId.current = null; setUploading(false); setReplacingId(null); onBusy?.(false); if (input.current) input.current.value = "" }
  }
  function replace(assetId: string) {
    if (locked || disabled || uploading) return
    replacementId.current = assetId
    input.current?.click()
  }
  return <details className={styles.drawer} open>
    <summary><span><ImagePlus size={17} /> References <small>{assets.length}/{MAX_PRODUCTION_REFERENCES}</small></span>{locked && <LockKeyhole size={14} aria-label="References locked" />}</summary>
    <p className={styles.help}>{locked ? "Saved with this brief. These images guide the crew's creative direction." : "Add images, videos and audio to your project. Lock images to make them required generation inputs. Lock audio to include the approved recording in your finished shot or scene. Supported generation inputs depend on the selected model and mode."}</p>
    {!locked && <p className={styles.help}>{`Optional auto-selection: each shot also picks up to ${MAX_SHOT_REFERENCES} of these that fit it best, and a tag like @image3 in your brief helps the crew choose. Neither is a lock; to require an image, lock it in that shot's Locked media.`}</p>}
    {!locked && <div className={styles.controls}>
      <label>Reference purpose<select value={role} disabled={disabled || uploading} onChange={event => setRole(event.target.value as ProductionAsset["role"])}>{["character", "wardrobe", "product", "location", "lighting"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" disabled={disabled || uploading || assets.length >= MAX_PRODUCTION_REFERENCES} onClick={() => { replacementId.current = null; input.current?.click() }}>{uploading && !replacingId ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}{uploading && !replacingId ? "Uploading..." : "Add images or videos"}</button>
      <input ref={input} type="file" accept="image/*,.heic,.heif,video/mp4,video/webm,video/quicktime" multiple hidden onChange={event => void upload(Array.from(event.target.files || []))} />
    </div>}
    {!!assets.length && <div className={styles.grid}>{assets.map(asset => <figure key={asset.id} aria-busy={replacingId === asset.id}>
      <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${asset.name}`}>{asset.mediaType === "video" ? <video src={asset.url} muted playsInline preload="metadata" controls /> : <img src={asset.url} alt={`${asset.role} reference: ${asset.name}`} loading="lazy" />}</a>
      <figcaption><strong>{asset.label ? <span className={styles.tag}>{asset.label}</span> : null}{asset.role}</strong><span title={asset.name}>{asset.name}</span></figcaption>
      {!locked && <div className={styles.assetActions}>
        <button type="button" className={styles.replace} disabled={disabled || uploading} aria-label={`Replace ${asset.name}`} onClick={() => replace(asset.id)}>{replacingId === asset.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}</button>
        <button type="button" className={styles.remove} disabled={disabled || uploading} aria-label={`Remove ${asset.name}`} onClick={() => onChange?.(assets.filter(item => item.id !== asset.id))}><X size={14} /></button>
      </div>}
    </figure>)}</div>}
    <p className={styles.help}>Images set the look: people, places, products. Videos show the movement and pace you want. Opening frame: the crew picks the best match for each shot, whatever the upload order. To choose it yourself, lock an image as Start frame in that shot&apos;s Locked media.</p>
    {audio ? <div className={styles.controls} data-testid="reference-audio">
      <span className="flex items-center gap-1.5 text-sm text-white/75"><AudioLines size={16} /> Audio <small>{audio.count}</small></span>
      <button type="button" disabled={disabled} onClick={() => audio.onOpen("upload")}><Upload size={16} />Upload audio</button>
      <button type="button" disabled={disabled || !audio.aiEnabled} onClick={() => audio.onOpen("ai")}><Sparkles size={16} />Create with AI</button>
      {audio.count > 0 && <button type="button" disabled={disabled} onClick={() => audio.onOpen("library")}>Film audio</button>}
    </div> : !locked && <p className={styles.help}>Audio (dialogue, music, sound effects, ambience) can be added once the crew has planned your shots.</p>}
    {!locked && <p className={styles.help}>Any photo (JPG, PNG, WebP, HEIC; we convert and resize for you) or an MP4 / WebM / MOV video up to 25 MB. You can swap them until the first video starts.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </details>
}
