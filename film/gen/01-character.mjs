import { credits, image } from "./kie.mjs"
const before = await credits()
await image(
  "Professional film character reference sheet of ONE woman, the same person shown four times on a seamless warm grey studio backdrop: front close-up portrait, three-quarter view, side profile, and full body standing. She is in her late twenties with warm brown skin, short tight dark curls with a single small gold hair clip above her left temple, a small gold hoop earring in her left ear, calm intense eyes, natural freckles. Wardrobe: a long olive-green wool trench coat open over a black turtleneck, black trousers, black leather boots. Soft cinematic key light, photorealistic, 85mm lens, highly detailed skin texture, no text, no labels.",
  [], "character_sheet.png", { aspect: "16:9" })
console.log("credits used:", before - (await credits()))
