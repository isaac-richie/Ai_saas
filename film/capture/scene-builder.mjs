// Scene Builder guided loop, captured from the real components on a temporary local page
// (src/app/dashboard/zz-film-scene) at three stages: choose, next, video.
import fs from "node:fs"
import { BASE, OUT, openApp } from "./app.mjs"

const { browser, page } = await openApp({ scale: 2 })
const pageRect = async (locator) => {
  const el = locator.first()
  if (!(await el.count())) return null
  const box = await el.boundingBox()
  const scrollY = await page.evaluate(() => window.scrollY)
  return box ? { x: Math.round(box.x), y: Math.round(box.y + scrollY), w: Math.round(box.width), h: Math.round(box.height) } : null
}
const layout = {}

for (const stage of ["choose", "next", "video"]) {
  await page.goto(`${BASE}/dashboard/zz-film-scene?stage=${stage}`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(stage === "choose" ? 9000 : 6000)
  const composer = page.getByRole("textbox").first()
  if (stage === "choose") {
    await composer.fill("He raises the megaphone and shouts as the robots march past.")
    await page.waitForTimeout(800)
  }
  const flow = page.locator("section[aria-label$='progress']")
  const top = (await pageRect(page.getByText("What do you want to see?").first())).y - 70
  const flowRect = await pageRect(flow)
  const clip = { x: 0, y: top, width: 1920, height: flowRect.y + flowRect.h + 60 - top }
  layout[stage] = {
    clip,
    composer: await pageRect(composer),
    generateImage: await pageRect(page.getByRole("button", { name: /^Generate image$/ })),
    using: await pageRect(page.getByText("Using", { exact: true })),
    flow: flowRect,
    optionA: await pageRect(page.getByRole("radio", { name: /Option A/ })),
    optionB: await pageRect(page.getByRole("radio", { name: /Option B/ })),
    approve: await pageRect(page.getByRole("button", { name: /Approve image/ })),
    animate: await pageRect(page.getByRole("button", { name: /Animate this image/ })),
    addSequence: await pageRect(page.getByRole("button", { name: /Add to sequence/ })),
    continue: await pageRect(page.getByRole("button", { name: /Continue to next shot/ })),
    approvedImage: await pageRect(page.getByAltText("Approved image")),
    video: await pageRect(flow.locator("video")),
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.screenshot({ path: new URL(`scene-${stage}.png`, OUT).pathname, fullPage: true, clip })
  if (stage === "choose") {
    // Same view with Option A tapped: gold border, check, "Selected: Option A".
    await page.getByRole("radio", { name: /Option A/ }).first().click()
    await page.waitForTimeout(800)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: new URL("scene-chosen.png", OUT).pathname, fullPage: true, clip })
  }
}

fs.writeFileSync(new URL("scene-builder.json", OUT), JSON.stringify(layout, null, 2))
console.log(JSON.stringify(layout))
await browser.close()
