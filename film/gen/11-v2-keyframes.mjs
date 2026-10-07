import { credits, host, image } from "./kie.mjs"
const sheet = await host("v2_character_sheet.png")
const ui = await host("monitor_ui.png")
const HE = "the exact same man from the character reference sheet (late twenties, short dark hair, light stubble, small scar through his left eyebrow)"
const COAT = "wearing a black turtleneck and an olive-green wool trench coat"
const FILM = "cinematic lighting, 35mm film still, photorealistic, shallow depth of field, no watermark"
const live = {
  "v2_k1_studio.png": [`Photorealistic medium shot over his shoulder of ${HE}, ${COAT}, sitting in a dark cinematic editing studio. In front of him a sleek computer monitor displays the dark web app interface from the second reference image, with the large white text "Your imagination." and gold italic "In motion." clearly readable. Screen light reflects softly in his eyes, rain-streaked window in the background, ${FILM}`, [sheet, ui]],
  "v2_k2_desert.png": [`Photorealistic full-body shot of ${HE}, ${COAT}, standing on a vast sand dune at golden hour. Warm sunlight backlighting his silhouette, wind whipping through his coat, rolling sand dunes in the background, ${FILM}`, [sheet]],
  "v2_k3_snow.png": [`Photorealistic wide cinematic shot of ${HE} in his olive-green trench coat walking away across a vast pristine field of white snow under a soft overcast sky, minimalist composition, footprints in the snow behind him, high contrast, ${FILM}`, [sheet]],
  "v2_k4_rain.png": [`Photorealistic cinematic close-up portrait of ${HE} in a dark rain-soaked city street at midnight, natural water droplets running down his skin and coat, steam rising in the background neon glow, dramatic rim lighting, ${FILM}`, [sheet]],
  "v2_k13_return.png": [`Photorealistic medium profile shot of ${HE}, ${COAT}, in the same dark editing studio, leaning back in his workstation chair and looking at the glowing monitor showing the web app interface from the second reference image, a faint confident smile, rain on the window behind, ${FILM}`, [sheet, ui]],
}
const SAME = "of the same man as the reference sheet, recognisable face, short dark hair, stubble, eyebrow scar, olive coat and black turtleneck translated into the style"
const styles = {
  "v2_s1_cyberpunk.png": `Cyberpunk male character portrait ${SAME}, neon purple and blue lighting, glowing futuristic jacket details, rain-soaked city street in the background, cinematic film still`,
  "v2_s2_origami.png": `Origami paper male character portrait ${SAME}, folded paper texture, sharp geometric angles, visible paper creases, clean minimal background, soft studio lighting`,
  "v2_s3_pixel.png": `8-bit pixel art male character ${SAME}, retro video game sprite portrait, limited colour palette, blocky pixels, pixel-perfect details`,
  "v2_s4_clay.png": `Claymation male character ${SAME}, plasticine texture, handmade clay details, stop-motion animation aesthetic, playful studio lighting`,
  "v2_s5_ink.png": `Ink sketch male character portrait ${SAME}, expressive hand-drawn black ink lines, sketchbook paper texture, high contrast`,
  "v2_s6_comic.png": `Comic book male character ${SAME}, bold ink lines, halftone dots, dynamic dramatic pose, vibrant retro comic colours`,
  "v2_s7_3d.png": `3D animated movie male character ${SAME}, Pixar-like style, big expressive eyes, smooth render, warm volumetric lighting`,
  "v2_s8_real.png": `Photorealistic character portrait of ${HE}, ${COAT}, warm studio light, clean shallow depth of field, 35mm film still`,
}
const before = await credits()
const jobs = [
  ...Object.entries(live).map(([f, [p, refs]]) => image(p, refs, f, { aspect: "16:9" })),
  ...Object.entries(styles).map(([f, p]) => image(p, [sheet], f, { aspect: "16:9" })),
]
const res = await Promise.allSettled(jobs)
res.forEach((r) => { if (r.status === "rejected") console.log("FAILED", r.reason.message) })
console.log("credits used:", before - (await credits()))
