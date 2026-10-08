import { credits, host, image } from "./kie.mjs"
const sheet = await host("v2_character_sheet.png")
const ui = await host("monitor_ui.png")
const mark = await host("visiowave_mark_ref.png")
const HE = "the same man from the character reference sheet (late twenties, short dark hair, light stubble, small scar through his left eyebrow)"
const K = {
  "v3_c1_cyber_start.png": [`Ground-level cinematic shot of ${HE} in a futuristic olive trench coat walking across a neon rain-soaked cyberpunk street at night, holding a closed high-tech umbrella with a glowing rim, confident smile, crowds and neon signs, puddles reflecting magenta and cyan light, cinematic film still`, [sheet]],
  "v3_c1_cyber_end.png": [`Extreme top-down bird's-eye overhead shot looking straight down at a neon rain-soaked cyberpunk street at night. Dozens of pedestrians hold open circular luminous umbrellas, arranged so the glowing umbrellas together form the exact eye-and-soundwave logo shape from the second reference image, wet street and neon puddles around them, cinematic film still`, [sheet, mark]],
  "v3_c2_origami.png": [`Over-the-shoulder macro close-up of a folded-paper origami version of ${HE} sitting on an origami bench in a geometric paper park, his paper hands holding a pencil over a textured paper notepad with crisp handwritten ink words "Create not Destroy", paper trees, soft studio lighting`, [sheet]],
  "v3_c3_pixel.png": [`Isometric high-angle retro 8-bit pixel-art game view of a detective version of ${HE} in an olive trench coat walking through towering gothic library bookshelves, a glowing clue scroll on a shelf, clean pixel-art contours, limited palette`, [sheet]],
  "v3_c4_clay.png": [`Low-angle claymation scene of a sculpted plasticine version of ${HE} in an olive trench coat stepping through the wooden doors into a bustling traditional British pub, wooden bar, clay patrons raising pints, visible thumbprint textures, stop-motion look`, [sheet]],
  "v3_c5_ink.png": [`Dynamic tilted dutch-angle medium close-up rotoscope pencil-sketch of ${HE} singing passionately into a vintage studio microphone, 1980s rotoscope music-video sketch style, vibrating cross-hatched black ink lines on high-contrast sketchbook paper`, [sheet]],
  "v3_c6_comic.png": [`Dramatic worm's-eye low-angle comic book panel of a superhero version of ${HE} with a cape over his olive suit, launching into the sky with one arm raised, a cracked impact crater in the pavement below, speed lines, halftone dots, vibrant retro comic colours, no speech bubbles, no text`, [sheet]],
  "v3_c7_bbq.png": [`Wide panoramic Pixar-style 3D animated shot of a lively sunny backyard barbecue, a smiling animated version of ${HE} flipping skewers on a grill, family and friends around picnic tables with red, black and white Trinidad and Tobago flag-themed cups, warm volumetric sunlight`, [sheet]],
  "v3_return.png": [`Photorealistic medium side-profile shot of ${HE}, wearing a black turtleneck and olive-green wool trench coat, seated in the same dark editing studio, leaning back slightly in his chair and facing his computer monitor squarely; the monitor stands directly in front of his face, its screen facing him and angled so the camera also sees it, showing the dark web interface from the second reference image ("Your imagination. In motion."). Monitor glow on his face, rain on the window behind, no brand logo on the monitor, 35mm film still, shallow depth of field`, [sheet, ui]],
}
const before = await credits()
const res = await Promise.allSettled(Object.entries(K).map(([f, [p, refs]]) => image(p, refs, f, { aspect: "16:9" })))
res.forEach((r, i) => { if (r.status === "rejected") console.log("FAILED", Object.keys(K)[i], r.reason.message) })
console.log("credits used:", before - (await credits()))
