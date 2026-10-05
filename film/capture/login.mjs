// Opens a visible Chrome window on the local app so you can sign in once.
// The session is kept in film/.profile (git-ignored) for the scripted captures.
// Usage: node capture/login.mjs
import { chromium } from "playwright-core"

const BASE = process.env.FILM_BASE_URL || "http://localhost:3000"
const context = await chromium.launchPersistentContext(new URL("../.profile", import.meta.url).pathname, {
  channel: "chrome", headless: false, viewport: { width: 1440, height: 900 },
})
const page = context.pages()[0] ?? (await context.newPage())
await page.goto(`${BASE}/login`)
console.log("Sign in in the Chrome window. It closes by itself once you reach the dashboard.")
await page.waitForURL(/\/dashboard/, { timeout: 15 * 60_000 })
await page.waitForTimeout(2000)
console.log("Signed in. Session saved.")
await context.close()
