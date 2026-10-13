import { credits, host, image } from "./kie.mjs"
const ref = await host("character_sheet.png")
const SHE = "the exact same woman from the reference sheet (warm brown skin, short tight dark curls with a small gold hair clip above her left temple, small gold hoop earring in her left ear, freckles), wearing her long olive-green wool trench coat over a black turtleneck"
const LOOK = "photorealistic cinematic film still, anamorphic 2.39 framing feel, shot on ARRI Alexa, shallow depth of field, subtle film grain, rich contrast, no text, no watermark"
const shots = {
  "k01_eye.png": `Extreme macro close-up of ${SHE}'s left eye slowly opening in a dark room, the warm glow of a computer screen reflected in her iris, individual lashes sharp, a hint of freckles, ${LOOK}`,
  "k02_studio.png": `Wide shot of a dark minimalist film studio at night. ${SHE} sits at a desk facing a large glowing monitor, seen from behind over her shoulder at three-quarter angle, the monitor light the only source, rain streaks on a tall window, moody teal and amber, ${LOOK}`,
  "k03_hands.png": `Close-up of ${SHE}'s hands typing on a dark keyboard, olive coat sleeve visible, the monitor's warm glow spilling over her fingers, shallow focus, dust in the light, ${LOOK}`,
  "k04_noir.png": `Medium shot of ${SHE} walking toward the camera down a rain-soaked city street at night, neon signs in red and teal reflecting on wet asphalt, her coat dark with rain, steam rising from a grate, confident stride, ${LOOK}`,
  "k05_desert.png": `Wide shot at golden hour of ${SHE} standing on the crest of a vast sand dune, her olive trench coat billowing in the wind, low sun flaring behind her, endless dunes, warm amber light, ${LOOK}`,
  "k06_underwater.png": `${SHE} floating weightlessly inside a submerged grand ballroom, crystal chandeliers drifting, shafts of blue light cutting down through the water, her coat and curls floating gracefully, tiny bubbles, serene, ${LOOK}`,
  "k07_neon.png": `Medium close-up of ${SHE} on a futuristic city rooftop at night, flying vehicles streaking past glowing towers behind her, magenta and cyan neon light on her face, she turns her head toward the camera, ${LOOK}`,
  "k08_snow.png": `Extreme wide shot of ${SHE} as a small figure walking alone across a vast pristine snowfield under a pale sky, her olive coat the only color, footprints trailing behind, soft falling snow, ${LOOK}`,
  "k09_desert_close.png": `Close-up portrait of ${SHE} in golden-hour desert light, wind lifting her curls, sunlight catching the gold clip and hoop earring, eyes squinting slightly into the sun, ${LOOK}`,
  "k10_return.png": `Medium close-up of ${SHE} back at her desk in the dark studio, leaning back in her chair with a faint satisfied smile, the monitor's warm glow on her face, ${LOOK}`,
}
const before = await credits()
const results = await Promise.allSettled(Object.entries(shots).map(([file, prompt]) => image(prompt, [ref], file, { aspect: "16:9" })))
results.forEach((r, i) => { if (r.status === "rejected") console.log("FAILED", Object.keys(shots)[i], r.reason.message) })
console.log("credits used:", before - (await credits()))
