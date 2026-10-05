import React from "react"
import { Img, staticFile, useCurrentFrame } from "remotion"
import { tween } from "./fx"
import { HEIGHT, WIDTH } from "./theme"

/** A camera framing on a page plate: point (cx, cy) in page px sits at frame centre, at `scale`. */
export type Shot = { at: number; cx: number; cy: number; scale: number }

/** The page coordinates of a frame position under the current camera. */
export function frameToPage(shot: { cx: number; cy: number; scale: number }, fx: number, fy: number) {
  return { x: shot.cx + (fx - WIDTH / 2) / shot.scale, y: shot.cy + (fy - HEIGHT / 2) / shot.scale }
}
export function pageToFrame(shot: { cx: number; cy: number; scale: number }, px: number, py: number) {
  return { x: WIDTH / 2 + (px - shot.cx) * shot.scale, y: HEIGHT / 2 + (py - shot.cy) * shot.scale }
}

/**
 * The camera at the current frame. With `page` set, the framing is kept inside the
 * page so its edges never show, however close the camera pushes.
 */
export function useShot(shots: Shot[], page?: { width: number; height: number }) {
  const frame = useCurrentFrame()
  const at = shots.map((s) => s.at)
  const pick = (f: (s: Shot) => number) => (shots.length === 1 ? f(shots[0]) : tween(frame, at, shots.map(f)))
  // Interpolate scale in log space so zooms feel even.
  const scale = Math.exp(pick((s) => Math.log(s.scale)))
  let cx = pick((s) => s.cx)
  let cy = pick((s) => s.cy)
  if (page) {
    const hx = WIDTH / 2 / scale
    const hy = HEIGHT / 2 / scale
    cx = page.width <= hx * 2 ? page.width / 2 : Math.min(Math.max(cx, hx), page.width - hx)
    cy = page.height <= hy * 2 ? page.height / 2 : Math.min(Math.max(cy, hy), page.height - hy)
  }
  return { cx, cy, scale }
}

/**
 * A captured page (CSS px, captured at 2x) under a virtual camera. Children are laid out in
 * page coordinates, so live video or overlays can sit exactly on top of UI elements.
 */
export const Plate: React.FC<{ src: string; width: number; height: number; shot: { cx: number; cy: number; scale: number }; children?: React.ReactNode }> = ({ src, width, height, shot, children }) => (
  <div style={{
    position: "absolute", left: 0, top: 0, width, height,
    transformOrigin: "0 0",
    transform: `translate(${WIDTH / 2 - shot.cx * shot.scale}px, ${HEIGHT / 2 - shot.cy * shot.scale}px) scale(${shot.scale})`,
  }}>
    <Img src={staticFile(src)} style={{ width, height, display: "block" }} />
    {children}
  </div>
)
