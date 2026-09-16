"use client"

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react"
import { ImagePlus, Loader2, LockKeyhole, X } from "lucide-react"
import type { ProductionAsset } from "@/core/validation/production-assets"
import styles from "./ProductionReferences.module.css"

export function ProductionReferences({ assets, onChange, disabled = false, onBusy }: {
  assets: ProductionAsset[]; onChange?: (assets: ProductionAsset[]) => void; disabled?: boolean; onBusy?: (busy: boolean) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [role, setRole] = useState<ProductionAsset["role"]>("character")
  const input = useRef<HTMLInputElement>(null)
  const locked = !onChange
  async function upload(file?: File) {
    if (!file || !onChange || uploading) return
    setError("")
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024 || !file.size) {
      setError("Choose a JPG, PNG, or WebP image under 4 MB."); return
    }
    setUploading(true); onBusy?.(true)
    try {
      const body = new FormData(); body.set("file", file)
      const response = await fetch("/api/upload", { method: "POST", body })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.url) throw new Error(result?.error || "Upload failed. Please try again.")
      onChange([...assets, { id: crypto.randomUUID(), name: file.name.slice(0, 160), role, url: result.url }])
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed") }
    finally { setUploading(false); onBusy?.(false); if (input.current) input.current.value = "" }
  }
  return <details className={styles.drawer} open>
    <summary><span><ImagePlus size={17} /> References <small>{assets.length}/6</small></span>{locked && <LockKeyhole size={14} aria-label="References locked" />}</summary>
    <p className={styles.help}>{locked ? "Saved with this brief. These images guide the crew's creative direction." : "Give your crew a visual starting point. Add up to six images."}</p>
    {!locked && <div className={styles.controls}>
      <label>Image purpose<select value={role} disabled={disabled || uploading} onChange={event => setRole(event.target.value as ProductionAsset["role"])}>{["character", "wardrobe", "product", "location", "lighting"].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <button type="button" disabled={disabled || uploading || assets.length >= 6} onClick={() => input.current?.click()}>{uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}{uploading ? "Uploading..." : "Add image"}</button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={event => void upload(event.target.files?.[0])} />
    </div>}
    {!!assets.length && <div className={styles.grid}>{assets.map(asset => <figure key={asset.id}>
      <a href={asset.url} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${asset.name}`}><img src={asset.url} alt={`${asset.role} reference: ${asset.name}`} loading="lazy" /></a>
      <figcaption><strong>{asset.role}</strong><span title={asset.name}>{asset.name}</span></figcaption>
      {!locked && <button type="button" className={styles.remove} disabled={disabled || uploading} aria-label={`Remove ${asset.name}`} onClick={() => onChange?.(assets.filter(item => item.id !== asset.id))}><X size={14} /></button>}
    </figure>)}</div>}
    <p className={styles.help}>All images guide creative direction. The first character or product image also guides the opening video frame; later shots use the previous approved ending frame.</p>
    {!locked && <p className={styles.help}>JPG, PNG or WebP · Up to 4 MB each. References lock when you save the brief.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </details>
}
