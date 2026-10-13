import { credits, image } from "./kie.mjs"
const before = await credits()
await image(
  "Professional film character reference sheet of ONE man, the same person shown four times on a seamless warm grey studio backdrop: front close-up portrait, three-quarter view, side profile, and full body standing. He is in his late twenties with short dark hair neatly textured, light stubble, warm medium-brown skin, calm focused dark eyes, a small scar through his left eyebrow. Wardrobe: a long olive-green wool trench coat open over a black turtleneck, black trousers, black leather boots. Soft cinematic key light, photorealistic, 85mm lens, detailed skin texture, no text, no labels.",
  [], "v2_character_sheet.png", { aspect: "16:9" })
console.log("credits used:", before - (await credits()))
