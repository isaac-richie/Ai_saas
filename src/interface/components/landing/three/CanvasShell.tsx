"use client"

import { Canvas } from "@react-three/fiber"
import type { ReactNode } from "react"

/**
 * The only module in the tree that imports `@react-three/fiber`.
 *
 * This exists purely so the renderer can be code-split. StageCanvas must be
 * statically importable (it renders the fallback, which everyone sees), but a
 * static `import { Canvas }` there would pull three + r3f — well over half a
 * megabyte — into the page's main chunk for every visitor, including the phones
 * and reduced-motion users who never mount a canvas at all.
 *
 * Keeping the import behind this boundary means the renderer is fetched only
 * once StageCanvas has actually decided to mount it.
 */
export function CanvasShell({
  children,
  dpr,
  active,
}: {
  children: ReactNode
  dpr: [number, number]
  active: boolean
}) {
  return (
    <Canvas
      dpr={dpr}
      // Idle the loop when off-screen or backgrounded. "demand" rather than
      // "never" so the scene still paints a single frame and the canvas is
      // never composited blank.
      frameloop={active ? "always" : "demand"}
      gl={{
        antialias: false, // additive/bloomy content — AA buys little, costs fill rate
        alpha: true,
        powerPreference: "high-performance",
        stencil: false,
        depth: false,
      }}
      camera={{ fov: 50, position: [0, 0, 6] }}
      style={{ pointerEvents: "none" }}
    >
      {children}
    </Canvas>
  )
}
