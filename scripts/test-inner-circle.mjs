import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const load = (path, requireMap = {}) => {
  const module = { exports: {} }
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, {
    module, exports: module.exports,
    require: (name) => {
      if (requireMap[name]) return requireMap[name]
      throw new Error(`Unexpected import ${name}`)
    },
  })
  return module.exports
}

const config = load("../src/core/config/inner-circle.ts")
const { buildInsights } = load("../src/core/utils/inner-circle/insights.ts", { "@/core/config/inner-circle": config })

let n = 0
const row = (over) => ({
  id: `id-${++n}`, full_name: null, instagram_handle: null, social_handle: null, feedback_text: null, status: "pending",
  email: `user${n}@example.com`, referral_code: `CODE${n}`, referred_by_code: null, referral_count: 0,
  created_at: new Date(Date.UTC(2026, 9, n)).toISOString(), ...over,
})

test("each invited sign-up names its inviter, and inviters rank by the people they brought", () => {
  const maya = row({ social_handle: "@maya.films", referral_code: "MAYA0001" })
  const ken = row({ referral_code: "KEN00002" })
  const a = row({ referred_by_code: "maya0001" })
  const b = row({ referred_by_code: "MAYA0001", status: "active" })
  const c = row({ referred_by_code: "KEN00002" })
  const stray = row({ referred_by_code: "NOPE9999" })
  const { members, leaderboard, stats } = buildInsights([maya, ken, a, b, c, stray])
  const byId = Object.fromEntries(members.map((m) => [m.id, m]))

  assert.equal(byId[a.id].invitedBy.name, "@maya.films", "codes match case-insensitively")
  assert.equal(byId[c.id].invitedBy.name, "user2", "no handle falls back to the email name")
  assert.equal(byId[stray.id].invitedBy, null)
  assert.equal(byId[stray.id].unknownInviteCode, "NOPE9999")
  assert.equal(JSON.stringify(leaderboard.map((m) => [m.name, m.invitees.length])), JSON.stringify([["@maya.films", 2], ["user2", 1]]))
  assert.equal(leaderboard[0].invitees.find((i) => i.id === b.id).hasAccess, true)
  assert.equal(JSON.stringify(stats), JSON.stringify({ total: 6, invited: 3, withAccess: 1, answered: 0 }))
})

test("problem chips are counted and written answers become quotes without the chips", () => {
  const { problems, quotes, stats } = buildInsights([
    row({ feedback_text: "Lip-sync looks off; Clips are too short; Need the same face in every shot" }),
    row({ feedback_text: "Lip-sync looks off" }),
    row({ feedback_text: "Pricing is wild" }),
  ])
  assert.equal(problems[0].label, "Lip-sync looks off")
  assert.equal(problems[0].count, 2)
  assert.equal(problems.find((p) => p.label === "Clips are too short").count, 1)
  assert.equal(problems.find((p) => p.label === "Too expensive").count, 0, "free text never counts as a chip")
  assert.equal(JSON.stringify(quotes.map((q) => q.text)), JSON.stringify(["Pricing is wild", "Need the same face in every shot"]))
  assert.equal(stats.answered, 3)
})

test("legacy rows with Instagram and 'x: @a | tiktok: @b' still get a readable name", () => {
  const legacy = row({ instagram_handle: "oldgram", social_handle: "x: @oldx | tiktok: @oldtt" })
  const blank = row({ instagram_handle: "not-provided", social_handle: "not-provided" })
  const names = Object.fromEntries(buildInsights([legacy, blank]).members.map((m) => [m.id, m.name]))
  assert.equal(names[legacy.id], "@oldgram")
  assert.equal(names[blank.id], blank.email.split("@")[0])
})
