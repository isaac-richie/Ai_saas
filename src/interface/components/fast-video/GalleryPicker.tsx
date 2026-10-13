"use client"

import { useEffect, useRef, useState } from "react"
import { Film } from "lucide-react"
import { getGalleryAssets, type GalleryAsset } from "@/core/actions/gallery"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/interface/components/ui/dialog"
import { sameOriginMediaUrl } from "./frame-capture"

/** Shared gallery chooser: an image, or a chosen moment from a video. */
export function GalleryPicker({ open, title, description = "Pick an image, or a moment from one of your videos.", imagesOnly = false, onClose, onPick }: {
  open: boolean
  title: string
  description?: string
  /** Hide videos when only still images make sense. */
  imagesOnly?: boolean
  onClose: () => void
  onPick: (asset: GalleryAsset, atSeconds: number) => void
}) {
  const [assets, setAssets] = useState<GalleryAsset[] | null>(null)
  const [selected, setSelected] = useState<GalleryAsset | null>(null)
  const [time, setTime] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void getGalleryAssets().then((result) => { if (!cancelled) setAssets((result.data || []).filter((asset) => !imagesOnly || asset.type === "image").slice(0, 60)) }).catch(() => { if (!cancelled) setAssets([]) })
    return () => { cancelled = true }
  }, [open, imagesOnly])
  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl text-white">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="text-[#a3a59a]">{description}</DialogDescription>
        {selected?.type === "video" ? (
          <div className="space-y-3">
            <video ref={videoRef} src={sameOriginMediaUrl(selected.url)} controls playsInline className="aspect-video w-full rounded-xl bg-black" onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onSeeked={(event) => setTime(event.currentTarget.currentTime)} />
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-[#a3a59a] hover:text-gold-100">← Back to gallery</button>
              <button type="button" onClick={() => onPick(selected, time)} className="workspace-primary-link">
                <Film size={14} /> Use frame at {time.toFixed(1)}s
              </button>
            </div>
          </div>
        ) : assets === null ? (
          <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="lux-shimmer aspect-video rounded-lg" />)}</div>
        ) : assets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gold-400/20 py-8 text-center text-sm text-[#8f9086]">{imagesOnly ? "No images in your gallery yet." : "Your gallery is empty. Generate or save a clip first."}</p>
        ) : (
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {assets.map((asset) => (
              <button key={asset.id} type="button" onClick={() => asset.type === "video" ? setSelected(asset) : onPick(asset, 0)}
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
