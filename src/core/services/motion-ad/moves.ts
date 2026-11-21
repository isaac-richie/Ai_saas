/**
 * Camera moves and image checks, shared by the templates and the app so a warning always matches
 * what the render will do. All lateral moves travel right-to-left, so direction never reverses.
 */
import type { Shot } from "./contract"

export type Frame = { scale: number; x: number; y: number; rotate: number }

/** Camera at progress p (0..1) through a shot, in fractions of the frame. */
export function cameraAt(move: Shot["move"], p: number): Frame {
  const e = p < 0 ? 0 : p > 1 ? 1 : p
  const ease = e * e * (3 - 2 * e)
  switch (move) {
    case "drift": return { scale: 1.12, x: 0.03 - 0.06 * e, y: 0, rotate: 0 }
    case "push": return { scale: 1.06 + 0.16 * ease, x: 0, y: 0, rotate: 0 }
    case "rise": return { scale: 1.1 + 0.08 * e, x: 0, y: 0.05 - 0.08 * ease, rotate: 0 }
    case "slide": return { scale: 1.16, x: 0.06 - 0.12 * e, y: 0, rotate: 0 }
    case "orbit": return { scale: 1.16 + 0.04 * e, x: 0.02 - 0.04 * e, y: 0, rotate: -1.6 + 3.2 * ease }
    case "settle": return { scale: 1.14 - 0.12 * (1 - (1 - e) ** 3), x: 0, y: 0, rotate: 0 }
  }
}

/** The closest each move gets (its largest zoom), plus the transition's own push. */
export function maxZoom(move: Shot["move"]): number {
  const samples = Array.from({ length: 21 }, (_, i) => cameraAt(move, i / 20).scale)
  return Math.max(...samples) * 1.08
}

export type ImageInfo = { tag: string; width: number; height: number }
export type Output = { width: number; height: number }

/**
 * Warnings for images too small for how close the camera gets (brief: "Image too small for 4K").
 * An image may be enlarged by up to 35% before it looks soft; the film grain and constant motion hide that much.
 */
export const MAX_UPSCALE = 1.35
export function imageWarnings(shots: Shot[], images: ImageInfo[], output: Output): { shot: number; tag: string; message: string; maxResolution: string }[] {
  const byTag = new Map(images.map((i) => [i.tag, i]))
  const out: { shot: number; tag: string; message: string; maxResolution: string }[] = []
  for (const shot of shots) {
    const img = shot.image_tag ? byTag.get(shot.image_tag) : undefined
    if (!img) continue
    const needed = Math.max(output.width / img.width, output.height / img.height) * maxZoom(shot.move)
    if (needed > MAX_UPSCALE) {
      const fits1080 = Math.max(1920 / img.width, 1080 / img.height) * maxZoom(shot.move) <= MAX_UPSCALE
      const label = output.width >= 3840 || output.height >= 3840 ? "4K" : "this size"
      out.push({
        shot: shot.idx, tag: img.tag,
        message: `Image too small for ${label}: at this shot's closest point the ${img.width}×${img.height} image is enlarged ${needed.toFixed(1)}×, so it will look soft.`,
        maxResolution: fits1080 ? "1080p" : "lower than 1080p",
      })
    }
  }
  return out
}
