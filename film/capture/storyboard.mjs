// Storyboard continuity: shot 1 approved (with its real end frame), then the real
// "Continue to next shot" click creates shot 2, which starts from that frame.
// Demo data lives only in this capture browser's local storage.
import fs from "node:fs"
import { BASE, OUT, openApp } from "./app.mjs"

const demo = JSON.parse(fs.readFileSync(new URL("storyboard-demo.json", import.meta.url)))
const now = new Date().toISOString()
const shot1 = {
  id: "11111111-1111-4111-8111-000000000001",
  sourceClipId: "film-shot-1",
  url: demo.shot1.u,
  subject: "Against the crowd",
  prompt: "BB walks toward the camera as robotic pedestrians march past him",
  direction: "BB walks toward the camera as robotic pedestrians march past him",
  durationSeconds: 5,
  sceneGroup: "Scene A",
  note: "",
  status: "ready",
  review: "approved",
  createdAt: now,
  mediaReferences: [demo.characterRef],
  endFrame: { id: "22222222-2222-4222-8222-000000000001", assetPath: demo.endFramePath, name: "Against the crowd end.jpg", sourceType: "capture", sourceShotId: "11111111-1111-4111-8111-000000000001", sourceTimestampMs: 4800, sourceLabel: "Against the crowd", influence: "medium" },
  autoEnhance: true,
}

const { browser, context, page } = await openApp({ scale: 2 })
await context.addInitScript((state) => {
  try { if (!sessionStorage.getItem("film-seeded")) { localStorage.setItem("aisas.fast-video.v1", JSON.stringify(state)); sessionStorage.setItem("film-seeded", "1") } } catch {}
}, { storyboardItems: [shot1], activeTab: "storyboard" })

await page.goto(`${BASE}/dashboard/fast-video`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(8000)
await page.getByText("Single-shot", { exact: false }).first().click()
await page.waitForTimeout(2500)
await page.getByRole("button", { name: /^Storyboard/ }).first().click()
await page.waitForTimeout(5000)

const board = page.locator("article").first().locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]")
await board.scrollIntoViewIfNeeded()
await page.waitForTimeout(1500)
const pageRect = async (locator) => {
  const box = await locator.first().boundingBox()
  const scrollY = await page.evaluate(() => window.scrollY)
  return box ? { x: Math.round(box.x), y: Math.round(box.y + scrollY), w: Math.round(box.width), h: Math.round(box.height) } : null
}
const layout = {}
layout.boardA = await pageRect(board)
layout.continue = await pageRect(page.getByRole("button", { name: /Continue to next shot/ }))
layout.video1 = await pageRect(page.locator("article").first().locator("video"))
layout.shot1 = await pageRect(page.locator("article").first())
const clipA = { x: 0, y: layout.boardA.y - 40, width: 1920, height: Math.max(1080, layout.boardA.h + 80) }
await page.screenshot({ path: new URL("sb-a.png", OUT).pathname, fullPage: true, clip: clipA })
layout.clipA = clipA

await page.getByRole("button", { name: /Continue to next shot/ }).first().click()
await page.waitForTimeout(3500)
const second = page.locator("article").nth(1)
await second.getByRole("textbox").first().fill("He raises the megaphone and shouts, “Follow your dreams.”")
await page.waitForTimeout(2500)
layout.boardB = await pageRect(board)
layout.shot2 = await pageRect(second)
layout.generate2 = await pageRect(second.getByRole("button", { name: /Generate shot/ }))
layout.video1B = await pageRect(page.locator("article").first().locator("video"))
layout.start2 = await pageRect(second.locator("div.aspect-video").first())
layout.thumb2 = await pageRect(second.locator("span.h-7.w-12").first())
layout.banner2 = await pageRect(second.getByText(/Continuing from Shot/).locator("xpath=ancestor::div[1]"))
const clipB = { x: 0, y: layout.boardB.y - 40, width: 1920, height: Math.max(1080, layout.boardB.h + 80) }
await page.screenshot({ path: new URL("sb-b.png", OUT).pathname, fullPage: true, clip: clipB })
layout.clipB = clipB

fs.writeFileSync(new URL("storyboard.json", OUT), JSON.stringify(layout, null, 2))
console.log(JSON.stringify(layout))
await browser.close()
