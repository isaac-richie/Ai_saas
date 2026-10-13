import fs from "node:fs"
import { ASSETS, credits, host, image } from "./kie.mjs"
const sheet = await host("v2_character_sheet.png")
const ui = await host("monitor_ui.png")
for (const f of ["v2_k1_studio_fix.png"]) if (fs.existsSync(new URL(f, ASSETS))) fs.unlinkSync(new URL(f, ASSETS))
const before = await credits()
await image(
  "Photorealistic over-the-shoulder shot from directly behind and slightly above the right shoulder of the exact same man from the character reference sheet (short dark hair, olive-green wool trench coat over a black turtleneck), sitting at a desk in a dark cinematic editing studio. The large computer monitor stands squarely in front of him, centered, its screen facing him head-on and therefore also facing the camera. The screen fills the right two thirds of the frame and clearly shows the dark web app interface from the second reference image, with large white text \"Your imagination.\" and gold italic \"In motion.\" readable. The back of his head and shoulder are in soft focus in the left foreground, his hands on the keyboard below the screen, the screen glow lighting the edge of his face. A rain-streaked window in the dark background. No brand logo on the monitor. Cinematic lighting, 35mm film still, shallow depth of field.",
  [sheet, ui], "v2_k1_studio_fix.png", { aspect: "16:9" })
console.log("credits used:", before - (await credits()))
