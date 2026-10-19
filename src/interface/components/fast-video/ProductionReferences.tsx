"use client"

/* eslint-disable @next/next/no-img-element */
import { normalizeReferenceImage } from "./normalize-image"
import { useRef, useState } from "react"
import { ImagePlus, Loader2, LockKeyhole, RefreshCw, X } from "lucide-react"
import { toast } from "sonner"
import { labelProductionAssets, type ProductionAsset } from "@/core/validation/production-assets"
import styles from "./ProductionReferences.module.css"

export function ProductionReferences({ assets, onChange, disabled = false, onBusy }: {
  assets: ProductionAsset[]; onChange?: (assets: ProductionAsset[]) => void; disabled?: boolean; onBusy?: (busy: boolean) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [role, setRole] = useState<ProductionAsset["role"]>("character")
  const input = useRef<HTMLInputElement>(null)
  const replacementId = useRef<string | null>(null)
  const locked = !onChange
  function reportError(title: string, message: string) {
    setError(message)
    toast.error(title, { description: message })
  }
  async function upload(picked?: File) {
    let file = picked
    if (!file || !onChange || uploading) return
    setError("")
    // Kling's multi-image element API accepts only JPG and PNG images, at a smaller limit than our
    // general upload endpoint. Any other photo (WebP, AVIF, HEIC where readable, oversized PNG) is
    // converted to a high-quality JPEG here, so a production never reaches render with an unusable asset.
    const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type)
    const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(file.name)
    if (!isVideo && !looksLikeImage) {
      reportError("Unsupported reference file", `${file.name} isn't an image or video. Add a photo (JPG, PNG, WebP, HEIC) or an MP4, WebM or MOV video.`); return
    }
    if (isVideo && (file.size > 25 * 1024 * 1024 || !file.size)) {
      reportError("Video too large", `${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB. Videos must be under 25 MB; trim or export it smaller.`); return
    }
    if (!isVideo) {
      try { file = await normalizeReferenceImage(file) } catch (cause) {
        reportError("Couldn't use this image", cause instanceof Error ? cause.message : "Try a JPG or PNG."); return
      }
    }
    setUploading(true); onBusy?.(true)
    try {
      const body = new FormData(); body.set("file", file)
      const response = await fetch("/api/upload", { method: "POST", body })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.url) throw new Error(result?.error || "Upload failed. Please try again.")
      const replacement = assets.find(asset => asset.id === replacementId.current)
      const next: ProductionAsset = {
        id: replacement?.id || crypto.randomUUID(), name: file.name.slice(0, 160),
        role: replacement?.role || role, url: result.url, mediaType: isVideo ? "video" : "image",
      }
      // A replacement keeps its tag; a new file takes the next free @image/@video number.
      onChange(labelProductionAssets(replacement ? assets.map(asset => asset.id === replacement.id ? { ...next, label: replacement.label } : asset) : [...assets, next]))
    } catch (cause) { reportError("Reference upload failed", cause instanceof Error ? cause.message : "Upload failed") }
    finally { replacementId.current = null; setUploading(false); onBusy?.(false); if (input.current) input.current.value = "" }
  }
  function replace(assetId: string) {
    if (locked || disabled || uploading) return
    replacementId.current = assetId
    input.current?.click()
  }
  return <details className={styles.drawer} open>
    <summary><span><ImagePlus size={17} /> References <small>{assets.length}/6</small></span>{locked && <LockKeyhole size={14} aria-label="References locked" />}</summary>
    <p className={styles.help}>{locked ? "Saved with this brief. These images guide the crew's creative direction." : "Give your crew a visual starting point. Add up to six images."}</p>
    {!locked && <div className={styles.controls}>
      <label>Reference purpose<select value={role} disabled={disabled || uploading} onChange={event => setRole(event.target.value as ProductionAsset["role"])}>{["character", "wardrobe", "product", "location", "lighting"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" disabled={disabled || uploading || assets.length >= 6} onClick={() => { replacementId.current = null; input.current?.click() }}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}{uploading ? "Uploading..." : "Add image or video"}</button>
      <input ref={input} type="file" accept="image/*,.heic,.heif,video/mp4,video/webm,video/quicktime" hidden onChange={event => void upload(event.target.files?.[0])} />
    </div>}
    {!!assets.length && <div className={styles.grid}>{assets.map(asset => <figure key={asset.id}>
      <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${asset.name}`}>{asset.mediaType === "video" ? <video src={asset.url} muted playsInline preload="metadata" controls /> : <img src={asset.url} alt={`${asset.role} reference: ${asset.name}`} loading="lazy" />}</a>
      <figcaption><strong>{asset.label ? <span className={styles.tag}>{asset.label}</span> : null}{asset.role}</strong><span title={asset.name}>{asset.name}</span></figcaption>
      {!locked && <div className={styles.assetActions}>
        <button type="button" className={styles.replace} disabled={disabled || uploading} aria-label={`Replace ${asset.name}`} onClick={() => replace(asset.id)}><RefreshCw size={14} /></button>
        <button type="button" className={styles.remove} disabled={disabled || uploading} aria-label={`Remove ${asset.name}`} onClick={() => onChange?.(assets.filter(item => item.id !== asset.id))}><X size={14} /></button>
      </div>}
    </figure>)}</div>}
    <p className={styles.help}>Images set the look: people, places, products. Videos show the movement and pace you want. The first image opens your film; the rest guide every shot.</p>
    {!locked && <p className={styles.help}>Any photo (JPG, PNG, WebP, HEIC; we convert and resize for you) or an MP4 / WebM / MOV video up to 25 MB. You can swap them until the first video starts.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </details>
}
