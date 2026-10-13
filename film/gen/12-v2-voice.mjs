import { credits, task } from "./kie.mjs"
const before = await credits()
const text = "Visiowave Studios. Bringing imagination to life."
const tries = [
  ["elevenlabs/text-to-speech-multilingual-v2", { text, voice: "Brian", stability: 0.55, similarity_boost: 0.8, style: 0.25, speed: 0.92 }],
  ["elevenlabs/text-to-speech-turbo-2-5", { text, voice: "Brian", stability: 0.55, similarity_boost: 0.8, style: 0.25, speed: 0.92 }],
]
for (const [model, input] of tries) {
  try { await task(model, input, "v2_vo.mp3", { pollMs: 4000 }); break } catch (e) { console.log(model, "failed:", e.message) }
}
console.log("credits used:", before - (await credits()))
