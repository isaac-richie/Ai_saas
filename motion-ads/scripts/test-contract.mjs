// Motion Ad Director spike: the plan contract, voice-led timing, image checks and the plan step's retry.
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { createJiti } from "jiti"

const root = new URL("..", import.meta.url).pathname
const jiti = createJiti(import.meta.url)
const { validatePlan } = await jiti.import(`${root}src/contract.ts`)
const { retime, applyVoice, voiceProblem } = await jiti.import(`${root}src/timing.ts`)
const { imageWarnings, maxZoom, cameraAt } = await jiti.import(`${root}src/moves.ts`)
const { planStoryboard } = await jiti.import(`${root}src/planner.ts`)
const golden = () => JSON.parse(fs.readFileSync(`${root}src/fixtures/golden-mist.json`, "utf8"))

describe("the plan contract", () => {
  it("the brief's Golden Mist plan is valid", () => {
    const r = validatePlan(golden())
    assert.equal(r.ok, true, r.errors?.join("\n"))
  })
  it("plans with no images yet are valid (image_tag null)", () => {
    const g = golden(); g.shots.forEach((s) => { s.image_tag = null })
    assert.equal(validatePlan(g).ok, true)
  })
  it("refuses 4 or 11 shots", () => {
    const g = golden(); g.shots = g.shots.slice(0, 4)
    assert.equal(validatePlan(g).ok, false)
  })
  it("times must be contiguous, start at 0 and add up to total_s", () => {
    const g = golden(); g.shots[2].start_s = 4.3
    assert.match(validatePlan(g).errors.join(" "), /starts at 4\.3 s but shot 2 ends at 4 s/)
    const h = golden(); h.total_s = 13
    assert.match(validatePlan(h).errors.join(" "), /total_s is 13/)
  })
  it("the last shot is the end card; every other shot turns into the next with a transition", () => {
    const g = golden(); g.shots[5].transition = "whip"
    assert.match(validatePlan(g).errors.join(" "), /end card/)
    const h = golden(); h.shots[1].transition = null
    assert.match(validatePlan(h).errors.join(" "), /Shot 2 needs a transition/)
    const k = golden(); k.shots[1].turns_into = 4
    assert.match(validatePlan(k).errors.join(" "), /Shot 2 must turn into shot 3/)
  })
  it("only fixed moves and transitions, never a cross-dissolve", () => {
    const g = golden(); g.shots[0].transition = "cross_dissolve"
    assert.equal(validatePlan(g).ok, false)
    const h = golden(); h.shots[0].move = "spin"
    assert.equal(validatePlan(h).ok, false)
  })
  it("lines are short and in sentence case; Title Case is refused", () => {
    const g = golden(); g.shots[1].on_screen = "A Note Of Pure Intrigue"
    assert.match(validatePlan(g).errors.join(" "), /sentence case/)
    const h = golden(); h.shots[1].on_screen = "x".repeat(43)
    assert.equal(validatePlan(h).ok, false)
    const k = golden(); k.shots[1].on_screen = "a note of intrigue."
    assert.equal(validatePlan(k).ok, false)
  })
  it("refuses invented claims on screen or in the voice, unless the brief supplied them", () => {
    const g = golden(); g.shots[3].on_screen = "Rated 5 stars by 10,000 fans."
    assert.match(validatePlan(g).errors.join(" "), /claim/)
    const h = golden(); h.voiceover.script += " Guaranteed to last all day."
    assert.match(validatePlan(h).errors.join(" "), /voiceover makes a claim/)
    const k = golden(); k.shots[3].on_screen = "Rated 5 stars by our fans."
    assert.equal(validatePlan(k, { claimsAllowed: ["Rated 5 stars"] }).ok, true)
  })
  it("image prompts must ask for no text", () => {
    const g = golden(); g.images_needed[0].prompt = "Top-down flat lay of an amber perfume bottle with the brand name on it"
    assert.match(validatePlan(g).errors.join(" "), /must ask for no text/)
  })
  it("rejects non-JSON-shaped replies with a readable message", () => {
    const r = validatePlan("Here is your storyboard!")
    assert.equal(r.ok, false)
    assert.ok(r.errors.length >= 1)
  })
})

describe("voice-led timing", () => {
  it("the brief's 14.0 s voice: contiguous, frame-exact, the end card holds the close", () => {
    const shots = retime(golden().shots, 14.0)
    assert.equal(shots[0].start_s, 0)
    assert.equal(shots.at(-1).end_s, 14)
    for (let i = 1; i < shots.length; i++) assert.equal(shots[i].start_s, shots[i - 1].end_s)
    for (const s of shots) assert.ok(Math.abs(s.end_s * 25 - Math.round(s.end_s * 25)) < 1e-9, "on a frame")
    const end = shots.at(-1)
    assert.ok(end.end_s - end.start_s >= 2.5 && end.end_s - end.start_s <= 4)
  })
  it("the re-timed plan still validates against the voice", () => {
    const { plan } = applyVoice(golden(), 15.21, 15)
    assert.equal(validatePlan(plan, { voiceS: plan.total_s }).ok, true)
    assert.equal(plan.total_s, 15.2)
  })
  it("tells the user when the voice changes the length", () => {
    assert.match(applyVoice(golden(), 18.04, 15).note, /18\.0 s long instead of the 15 s you chose/)
    assert.equal(applyVoice(golden(), 15.1, 15).note, null)
  })
  it("refuses voices that are unreadable, too short or over 20 s", () => {
    assert.match(voiceProblem(NaN), /no length/)
    assert.match(voiceProblem(4), /at least 6 s/)
    assert.match(voiceProblem(23), /at most 20 s/)
    assert.equal(voiceProblem(14), null)
  })
})

describe("image checks and camera moves", () => {
  it("every move keeps moving and lateral moves all travel the same way", () => {
    for (const m of ["drift", "slide", "orbit"]) assert.ok(cameraAt(m, 1).x < cameraAt(m, 0).x, m)
    for (const m of ["drift", "push", "rise", "slide", "orbit", "settle"]) assert.notDeepEqual(cameraAt(m, 0), cameraAt(m, 1), m)
  })
  it("flags an image too small for 4K and says the largest size it suits", () => {
    const shot = { ...golden().shots[1], image_tag: "@image2" }
    const [w] = imageWarnings([shot], [{ tag: "@image2", width: 640, height: 800 }], { width: 3840, height: 2160 })
    assert.match(w.message, /^Image too small for 4K: .*640×800 image is enlarged \d+\.\d×, so it will look soft\.$/)
    assert.equal(w.maxResolution, "lower than 1080p")
  })
  it("a 1920×1536 image suits 1080p but not a 4K push", () => {
    const shot = { ...golden().shots[1], image_tag: "@image2" }
    const img = [{ tag: "@image2", width: 1920, height: 1536 }]
    assert.equal(imageWarnings([shot], img, { width: 1920, height: 1080 }).length, 0)
    assert.equal(imageWarnings([shot], img, { width: 3840, height: 2160 })[0].maxResolution, "1080p")
  })
  it("a true 4K image passes at 4K on a gentle move", () => {
    const shot = { ...golden().shots[0], image_tag: "@image1" }
    assert.ok(maxZoom("drift") < 1.25)
    assert.equal(imageWarnings([shot], [{ tag: "@image1", width: 4800, height: 2700 }], { width: 3840, height: 2160 }).length, 0)
  })
})

describe("the plan step", () => {
  const brief = { text: "A short ad for Golden Mist eau de parfum. Luxury, calm, golden light.", lengthS: 15, aspect: "16:9" }
  it("a valid first reply is used as-is", async () => {
    const r = await planStoryboard(async () => golden(), brief, "ma_001")
    assert.deepEqual([r.ok, r.attempts], [true, 1])
  })
  it("an invalid reply gets one retry, told exactly what was wrong", async () => {
    const seen = []
    const bad = golden(); bad.shots[1].on_screen = "Clinically proven to last 24 hours."
    const model = async (_i, input) => { seen.push(input); return seen.length === 1 ? bad : golden() }
    const r = await planStoryboard(model, brief, "ma_001")
    assert.deepEqual([r.ok, r.attempts], [true, 2])
    assert.match(seen[1], /previous reply was invalid[\s\S]*claim/)
  })
  it("two invalid replies fail the job and charge nothing", async () => {
    const r = await planStoryboard(async () => ({ nope: true }), brief, "ma_001")
    assert.deepEqual([r.ok, r.attempts, r.charge], [false, 2, false])
  })
  it("the brief is passed as data, capped, with supplied facts and uploaded images", async () => {
    let input = ""
    await planStoryboard(async (_i, x) => { input = x; return golden() }, { ...brief, text: "x".repeat(5000), claims: ["Vegan"], imageTags: ["@image1"] }, "ma_9")
    const data = JSON.parse(input)
    assert.equal(data.brief.length, 2000)
    assert.deepEqual(data.supplied_facts, ["Vegan"])
    assert.deepEqual(data.uploaded_images, ["@image1"])
  })
})
