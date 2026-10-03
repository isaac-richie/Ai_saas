"use client"

import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET } from "@/core/validation/media-reference"
import { FRAME_MIME_TYPES, MAX_FRAME_BYTES } from "@/core/validation/shot-frames"

/** Canvas capture needs same-origin pixels, so remote media goes through our proxy. */
export function sameOriginMediaUrl(url: string) {
  if (url.startsWith("/") || url.startsWith("blob:")) return url
  try {
    if (new URL(url).origin === window.location.origin) return url
  } catch {
    return url
  }
  return `/api/media/proxy?url=${encodeURIComponent(url)}`
}

/**
 * Grabs one frame from a video without disturbing any on-screen player.
 * `at: "end"` takes the final frame, used for next-shot chaining.
 */
export async function captureVideoFrame(src: string, at: number | "end"): Promise<{ blob: Blob; timestampMs: number }> {
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.crossOrigin = "anonymous"
  const cleanup = () => { video.removeAttribute("src"); video.load() }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("This clip took too long to load for capture.")), 20_000)
      video.onloadedmetadata = () => { window.clearTimeout(timer); resolve() }
      video.onerror = () => { window.clearTimeout(timer); reject(new Error("This clip cannot be opened for frame capture.")) }
      video.src = sameOriginMediaUrl(src)
    })
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    const target = at === "end" ? Math.max(0, duration - 0.08) : Math.min(Math.max(0, at), Math.max(0, duration - 0.04))
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Could not seek to that frame.")), 15_000)
      video.onseeked = () => { window.clearTimeout(timer); resolve() }
      video.currentTime = target
    })
    const scale = Math.min(1, 1920 / Math.max(1, video.videoWidth))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext("2d")
    if (!context || !canvas.width || !canvas.height) throw new Error("This clip has no readable picture to capture.")
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
    if (!blob) throw new Error("Frame capture failed. Save the clip to your gallery, then select it from there.")
    return { blob, timestampMs: Math.round(target * 1000) }
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") throw new Error("This clip's host blocks frame capture. Save it to your gallery first, then select it from there.")
    throw error
  } finally {
    cleanup()
  }
}

export async function fetchImageBlob(url: string) {
  const response = await fetch(sameOriginMediaUrl(url), { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error("That image could not be loaded. Try another one.")
  return response.blob()
}

/** Stores a frame image in the owner's private reference bucket. */
export async function uploadFrameImage(blob: Blob): Promise<string> {
  const type = (FRAME_MIME_TYPES as readonly string[]).includes(blob.type) ? blob.type : ""
  if (!type) throw new Error("Use a JPG, PNG or WebP image for frames.")
  if (blob.size === 0 || blob.size > MAX_FRAME_BYTES) throw new Error("Frames must be non-empty images up to 10 MB.")
  const db = createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error("Please sign in to add frames.")
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"
  const assetPath = `${user.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage.from(REFERENCE_BUCKET).upload(assetPath, blob, { contentType: type, upsert: false })
  if (error) throw new Error("Frame upload failed. Check your connection and retry; existing references are unchanged.")
  return assetPath
}

export function formatTimestamp(ms: number | null | undefined) {
  if (ms == null) return ""
  return `${(ms / 1000).toFixed(1)}s`
}
