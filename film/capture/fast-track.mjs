// Fast Track single-shot studio: one tall 2x plate of the studio, crops of the prompt
// box at typing stages, the selected-preset state, and element positions in page px.
// Usage: node capture/fast-track.mjs   (signed-in session from capture/login.mjs)
import fs from "node:fs"
import { BASE, OUT, openApp } from "./app.mjs"

const PROMPT = "A lone warrior watches the sun sink over the valley, wind catching her hair"
const { browser, page } = await openApp({ scale: 2 })
await page.goto(`${BASE}/dashboard/fast-video`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(8000)
await page.getByText("Single-shot", { exact: false }).first().click()
await page.waitForTimeout(4000)

// Page-space rect (independent of scroll).
const pageRect = async (locator) => {
  const el = locator.first()
  await el.scrollIntoViewIfNeeded()
  const box = await el.boundingBox()
  const scrollY = await page.evaluate(() => window.scrollY)
  return box ? { x: Math.round(box.x), y: Math.round(box.y + scrollY), w: Math.round(box.width), h: Math.round(box.height) } : null
}

const prompt = page.getByPlaceholder(/Describe your shot/i)
const layout = {
  prompt: await pageRect(prompt),
  monitor: await pageRect(page.getByText(/appears here/i).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")),
  generate: await pageRect(page.getByRole("button", { name: /Generate Shot/i })),
  goldenHour: await pageRect(page.getByText("Golden Hour Film", { exact: true }).locator("xpath=ancestor::button[1]")),
  neonDrive: await pageRect(page.getByText("Neon Night Drive", { exact: true }).locator("xpath=ancestor::button[1]")),
  kling: await pageRect(page.getByText("Kling", { exact: true }).locator("xpath=ancestor::button[1]")),
}

// The studio card spans from the "Single-shot" header to below Generate Shot.
const top = Math.max(0, layout.prompt.y - 260)
const bottom = layout.generate.y + layout.generate.h + 120
layout.plate = { x: 0, y: top, w: 1920, h: bottom - top }
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(800)
await page.screenshot({ path: new URL("ft-plate.png", OUT).pathname, fullPage: true, clip: { x: 0, y: top, width: 1920, height: bottom - top } })

// Typing stages: crops of the prompt box only, overlaid on the plate during the type-on.
const stages = [0.12, 0.28, 0.45, 0.62, 0.8, 1]
layout.typing = []
await prompt.click()
for (const [i, t] of stages.entries()) {
  const text = PROMPT.slice(0, Math.round(PROMPT.length * t))
  await prompt.fill(text)
  await page.waitForTimeout(250)
  // Re-measure: the page can shift while typing.
  const r = await pageRect(prompt)
  if (i === 0) layout.promptTyping = r
  await page.screenshot({ path: new URL(`ft-type-${i}.png`, OUT).pathname, fullPage: true, clip: { x: r.x - 4, y: r.y - 4, width: r.w + 8, height: r.h + 8 } })
  layout.typing.push({ src: `captures/ft-type-${i}.png`, chars: text.length })
}

// Selected Golden Hour preset (gold border + check) as a crop for the click moment.
await page.getByText("Golden Hour Film", { exact: true }).first().click()
await page.waitForTimeout(700)
const g = await pageRect(page.getByText("Golden Hour Film", { exact: true }).locator("xpath=ancestor::button[1]"))
await page.screenshot({ path: new URL("ft-golden-selected.png", OUT).pathname, fullPage: true, clip: { x: g.x - 6, y: g.y - 6, width: g.w + 12, height: g.h + 12 } })

layout.prompt.text = PROMPT
fs.writeFileSync(new URL("fast-track.json", OUT), JSON.stringify(layout, null, 2))
console.log(JSON.stringify(layout))
await browser.close()
