// Captures pristine 2x stills of the landing page for the film, plus the
// on-screen positions of the elements the camera and cursor interact with.
// Usage: node capture/landing.mjs   (needs the dev server on :3000)
import { chromium } from "playwright-core"
import fs from "node:fs"

const OUT = new URL("../public/captures/", import.meta.url)
const BASE = process.env.FILM_BASE_URL || "http://localhost:3000"
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: "no-preference" })
const layout = {}

const rect = async (locator) => {
  const box = await locator.first().boundingBox()
  return box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null
}
const settle = (ms = 1600) => page.waitForTimeout(ms)
// Hide the Next.js dev badge and the caret so captures look like production.
const clean = () => page.addStyleTag({ content: "nextjs-portal{display:none!important} *{caret-color:transparent!important}" })

await page.goto(`${BASE}/`, { waitUntil: "networkidle" })
await clean()
await settle(2500)
await page.screenshot({ path: new URL("landing-hero.png", OUT).pathname })
// Taller plate so the camera can start inside the film frame and pull back to the page.
await page.screenshot({ path: new URL("landing-top.png", OUT).pathname, fullPage: true, clip: { x: 0, y: 0, width: 1920, height: 1400 } })
layout.landingHero = {
  enterStudio: await rect(page.getByRole("link", { name: /Enter the studio/ })),
  title: await rect(page.locator(".cinema-title")),
  reel: await rect(page.locator(".cinema-reel-screen")),
}

for (const [name, selector] of [["landing-craft", "#craft"], ["landing-models", "#models"]]) {
  await page.locator(selector).scrollIntoViewIfNeeded()
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), selector)
  await settle()
  await page.screenshot({ path: new URL(`${name}.png`, OUT).pathname })
}

// Closing invitation with the second "Enter the studio".
await page.evaluate(() => document.querySelector(".cinema-invitation")?.scrollIntoView({ block: "center" }))
await settle()
await page.screenshot({ path: new URL("landing-invitation.png", OUT).pathname })
layout.landingInvitation = { enterStudio: await rect(page.locator(".cinema-invitation").getByRole("link", { name: /Enter the studio/ })) }

fs.writeFileSync(new URL("landing.json", OUT), JSON.stringify(layout, null, 2))
console.log(JSON.stringify(layout))
await browser.close()
