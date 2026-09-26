"use client"

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react"
import { ImagePlus, Loader2, LockKeyhole, RefreshCw, X } from "lucide-react"
import type { ProductionAsset } from "@/core/validation/production-assets"
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
  async function upload(file?: File) {
    if (!file || !onChange || uploading) return
    setError("")
    // Kling's multi-image element API accepts only JPG and PNG images, at a
    // smaller limit than our general upload endpoint. Validate here so a
    // production does not reach its render checkpoint with an unusable asset.
    const isImage = ["image/jpeg", "image/png"].includes(file.type)
    const isVideo = ["video/mp4", "video/webm", "video/quicktime"].includes(file.type)
    const maxBytes = isImage ? 10 * 1024 * 1024 : 25 * 1024 * 1024
    if ((!isImage && !isVideo) || file.size > maxBytes || !file.size) {
      setError("Choose a JPG or PNG image under 10 MB, or an MP4, WebM, or MOV video under 25 MB."); return
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
      onChange(replacement ? assets.map(asset => asset.id === replacement.id ? next : asset) : [...assets, next])
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed") }
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
      <input ref={input} type="file" accept="image/jpeg,image/png,video/mp4,video/webm,video/quicktime" hidden onChange={event => void upload(event.target.files?.[0])} />
    </div>}
    {!!assets.length && <div className={styles.grid}>{assets.map(asset => <figure key={asset.id}>
      <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${asset.name}`}>{asset.mediaType === "video" ? <video src={asset.url} muted playsInline preload="metadata" controls /> : <img src={asset.url} alt={`${asset.role} reference: ${asset.name}`} loading="lazy" />}</a>
      <figcaption><strong>{asset.role}</strong><span title={asset.name}>{asset.name}</span></figcaption>
      {!locked && <div className={styles.assetActions}>
        <button type="button" className={styles.replace} disabled={disabled || uploading} aria-label={`Replace ${asset.name}`} onClick={() => replace(asset.id)}><RefreshCw size={14} /></button>
        <button type="button" className={styles.remove} disabled={disabled || uploading} aria-label={`Remove ${asset.name}`} onClick={() => onChange?.(assets.filter(item => item.id !== asset.id))}><X size={14} /></button>
      </div>}
    </figure>)}</div>}
    <p className={styles.help}>Images guide the visual world. Video references guide motion and pacing; the crew samples their frames when media processing is available. The current render adapter uses one opening image-to-video source frame; all other references guide the crew’s prompts and continuity plan.</p>
    {!locked && <p className={styles.help}>JPG or PNG images up to 10 MB · MP4, WebM or MOV videos up to 25 MB. You can remove or replace an individual item until the first video generation begins.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </details>
}
