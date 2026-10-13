// Opens a visible Chrome window on the local app so you can sign in once.
// The session is kept in film/.profile (git-ignored) for the scripted captures.
// Usage: node capture/login.mjs
import { chromium } from "playwright-core"

const BASE = process.env.FILM_BASE_URL || "http://localhost:3000"
const context = await chromium.launchPersistentContext(new URL("../.profile", import.meta.url).pathname, {
  channel: "chrome", headless: false, viewport: { width: 1440, height: 900 },
})
const page = context.pages()[0] ?? (await context.newPage())
page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) console.log("page:", frame.url().replace(/[?#].*/, "")) })
context.on("page", (p) => console.log("new tab:", p.url()))
await page.goto(`${BASE}/login`)
await page.bringToFront()
console.log("Sign in in the Chrome window. It closes by itself once you are signed in.")
// Only a real dashboard page proves the sign-in finished.
await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 30 * 60_000 })
await page.waitForTimeout(4000)
// Session cookies vanish when the window closes, so save the full session to a file.
await context.storageState({ path: new URL("../.profile/session.json", import.meta.url).pathname })
await page.waitForTimeout(2000)
console.log("Signed in. Session saved.")
await context.close()
