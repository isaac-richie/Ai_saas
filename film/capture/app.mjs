// Shared setup for signed-in app captures: saved session, no tour, no dev badges.
import { chromium } from "playwright-core"
import fs from "node:fs"

export const BASE = process.env.FILM_BASE_URL || "http://localhost:3000"
export const OUT = new URL("../public/captures/", import.meta.url)
fs.mkdirSync(OUT, { recursive: true })

export async function openApp({ scale = 2 } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const context = await browser.newContext({
    storageState: new URL("../.profile/session.json", import.meta.url).pathname,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: scale,
  })
  await context.addInitScript(() => {
    try { localStorage.setItem("aisas.tour.completed.v1", "1") } catch {}
    const style = document.createElement("style")
    style.textContent = "nextjs-portal{display:none!important} *{caret-color:transparent!important} [data-sonner-toaster]{display:none!important}"
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style))
  })
  const page = await context.newPage()
  return { browser, context, page }
}

export const rect = async (locator) => {
  const box = await locator.first().boundingBox()
  return box ? { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) } : null
}

export const shot = (page, name, options = {}) => page.screenshot({ path: new URL(`${name}.png`, OUT).pathname, ...options })
