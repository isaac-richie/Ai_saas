// Motion Ad Director render worker. Claims one queued job at a time (claim_motion_ad_job), renders it with
// our Remotion templates, uploads the files and moves the ad on. A final render's credits are charged on
// success and refunded if it fails after its one retry. Runs anywhere with Node 18+, Chrome and network:
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node worker.mjs        (add --once to do one job)
// Nothing the AI writes is executed: it only chooses the storyboard JSON these templates render.
import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"
import { makeWorker } from "./worker-core.mjs"

const ROOT = path.dirname(new URL(import.meta.url).pathname)
const env = { ...readEnv(path.join(ROOT, "../.env.local")), ...process.env }
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ONCE = process.argv.includes("--once")
const POLL_MS = 5000

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or add them to .env.local).")
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const publicUrl = (bucket, p) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${p}`
const log = (...a) => console.log(new Date().toISOString(), ...a)

function readEnv(file) {
  try {
    return Object.fromEntries(fs.readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]
    }))
  } catch { return {} }
}

const worker = makeWorker({ db, publicUrl, log })
log("motion ad worker started", ONCE ? "(once)" : "")
for (;;) {
  const worked = await worker.tick()
  if (ONCE) break
  if (!worked) await new Promise((r) => setTimeout(r, POLL_MS))
}
