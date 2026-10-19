"use client"

/* eslint-disable @next/next/no-img-element */
import { useState } from "react"
import { ImageOff } from "lucide-react"

const isVideo = (url: string) => /\.(mp4|webm|mov)($|\?)/i.test(url)

/**
 * A take's picture or clip with an explicit failure state: a missing, expired or broken file shows a
 * quiet "preview unavailable" panel instead of a broken image with the prompt spilling over it.
 */
export function TakeMedia({ url, videoSrc, fit = "cover", controls = true, autoPlay = false, className = "" }: {
  url: string | null | undefined
  /** Playable source for videos (e.g. the media proxy); defaults to `url`. */
  videoSrc?: string
  fit?: "cover" | "contain"
  controls?: boolean
  autoPlay?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!url || failed) {
    return (
      <div role="img" aria-label="Preview unavailable" className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-black/40 p-4 text-center ${className}`}>
        <span className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-white/50"><ImageOff className="size-4" /></span>
        <p className="text-[12px] text-[#9aa1ab]">{url ? "Preview unavailable. The file may have expired; generate again." : "Still rendering"}</p>
      </div>
    )
  }
  const fitClass = fit === "cover" ? "object-cover" : "object-contain"
  return isVideo(url)
    ? <video src={videoSrc ?? url} className={`h-full w-full ${fit === "cover" ? "object-contain" : fitClass} ${className}`} controls={controls} autoPlay={autoPlay} playsInline muted={!autoPlay} preload="metadata" onError={() => setFailed(true)} />
    : <img src={url} alt="" loading="lazy" className={`h-full w-full ${fitClass} ${className}`} onError={() => setFailed(true)} />
}
