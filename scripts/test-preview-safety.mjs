import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"
import vm from "node:vm"
import ts from "typescript"

test("routine production work routes below Astra without inheriting the legacy override", () => {
  const { resolveProductionModel, resolvePremiumProductionModel } = loadFunctions(
    "../src/core/config/production-model-routing.ts",
    ["ECONOMY_ROLES", "BALANCED_ROLES", "productionModelTier", "resolveProductionModel", "resolvePremiumProductionModel"],
  )
  const env = { PRODUCTION_CREW_MODEL: "gpt-6-astra" }
  for (const role of ["cinematographer", "lighting-director", "production-designer", "performance-director", "reference-analysis", "keyframe-inspection", "continuity-extractor"]) {
    assert.equal(resolveProductionModel(role, env).model, "gpt-6-luna")
  }
  for (const role of ["shot-editor", "continuity-reviewer", "take-correction", "story-director"]) {
    assert.equal(resolveProductionModel(role, env).model, "gpt-6-sol")
  }
  assert.equal(resolvePremiumProductionModel(env), "gpt-6-astra")
  assert.throws(() => resolveProductionModel("unclassified-task", env), /No production model route/)
})

function loadFunctions(path, names, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8")
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const code = tree.statements
    .filter(node =>
      (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.includes(item.name.getText(tree))))
    )
    .map(node => node.getText(tree)).join("\n")
  const compiled = ts.transpileModule(`${code}\nmodule.exports = { ${names.join(", ")} }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { module, exports: module.exports, Buffer, crypto, ...globals })
  return module.exports
}

test("database quota denial is authoritative even below the former 50-use override", async () => {
  const { consumeUsageQuota } = loadFunctions("../src/core/services/billing.ts", ["FEATURE_NAME", "consumeUsageQuota"])
  const denied = await consumeUsageQuota({ rpc: async () => ({ data: { allowed: false, used_count: 5, max_count: 5, remaining: 0 }, error: null }) }, "user", "fast_video")
  assert.equal(denied.allowed, false)
  assert.equal(denied.maxCount, 5)
  assert.match(denied.message, /5\/5/)
  const unavailable = await consumeUsageQuota({ rpc: async () => ({ data: null, error: new Error("unavailable") }) }, "user", "studio")
  assert.equal(unavailable.allowed, false)
})

test("allowance reservations carry an ID and failed jobs request an idempotent release", async () => {
  const calls = []
  const db = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (name === "reserve_usage_quota") return { data: { allowed: true, used_count: 1, max_count: 5, remaining: 4, reservation_id: args.p_reservation_id }, error: null }
    return { data: true, error: null }
  } }
  const { reserveUsageQuota, settleUsageQuota } = loadFunctions("../src/core/services/billing.ts", ["FEATURE_NAME", "reserveUsageQuota", "settleUsageQuota"], {
    hasSupabaseAdminEnv: () => true,
    createAdminClient: () => db,
  })
  const reserved = await reserveUsageQuota(db, "user", "fast_video", "request-id")
  assert.equal(reserved.allowed, true)
  assert.equal(reserved.reservationId, "request-id")
  assert.equal(await settleUsageQuota("user", reserved.reservationId, false), true)
  assert.equal(calls[1].name, "settle_usage_quota")
  assert.equal(calls[1].args.p_commit, false)
})

test("Fast Track reserves one unit per 10 seconds started and explains a clip that does not fit", async () => {
  const kie = loadFunctions("../src/core/config/kie-video-models.ts", ["FAST_TRACK_SECONDS_PER_UNIT", "fastTrackUnitsForDuration"])
  for (const [seconds, units] of [[3, 1], [10, 1], [11, 2], [20, 2], [21, 3], [30, 3]]) assert.equal(kie.fastTrackUnitsForDuration(seconds), units, `${seconds}s`)

  const calls = []
  let remaining = 4
  const db = { rpc: async (name, args) => {
    calls.push({ name, args })
    if (args.p_units > remaining) return { data: { allowed: false, used_count: 18, max_count: 20, remaining: 2, reservation_id: null }, error: null }
    remaining -= args.p_units
    return { data: { allowed: true, used_count: 20 - remaining, max_count: 20, remaining, reservation_id: args.p_reservation_id }, error: null }
  } }
  const { reserveUsageQuota } = loadFunctions("../src/core/services/billing.ts", ["FEATURE_NAME", "reserveUsageQuota"], { hasSupabaseAdminEnv: () => true, console })
  const ok = await reserveUsageQuota(db, "user", "fast_video", "clip-a", 2)
  assert.equal(ok.allowed, true)
  assert.equal(calls[0].args.p_units, 2)
  const denied = await reserveUsageQuota(db, "user", "fast_video", "clip-b", 3)
  assert.equal(denied.allowed, false)
  assert.match(denied.message, /uses 3 Fast Track generations and you have 2 left/)
})

test("before migration 0042 the one-unit reserve function is still used instead of blocking generations", async () => {
  const calls = []
  const db = { rpc: async (name, args) => {
    calls.push(args)
    if ("p_units" in args) return { data: null, error: { code: "PGRST202", message: "Could not find the function" } }
    return { data: { allowed: true, used_count: 1, max_count: null, remaining: null, reservation_id: args.p_reservation_id }, error: null }
  } }
  const { reserveUsageQuota } = loadFunctions("../src/core/services/billing.ts", ["FEATURE_NAME", "reserveUsageQuota"], { hasSupabaseAdminEnv: () => true, console: { warn() {} } })
  const reserved = await reserveUsageQuota(db, "user", "fast_video", "clip", 3)
  assert.equal(reserved.allowed, true)
  assert.equal(calls.length, 2)
  assert.equal("p_units" in calls[1], false)
})

test("migration 0042 reserves and releases exactly the units a clip took", () => {
  const sql = readFileSync(new URL("../src/infrastructure/supabase/migrations/0042_usage_quota_units.sql", import.meta.url), "utf8")
  assert.match(sql, /drop function if exists public\.reserve_usage_quota\(uuid, text, uuid\)/)
  assert.match(sql, /p_units integer default 1/)
  assert.match(sql, /v_used \+ v_units > v_max/)
  assert.match(sql, /fast_video_generations_used \+ v_units/)
  assert.match(sql, /fast_video_generations_used - v_reservation\.units/)
})

test("failed durable copy does not masquerade as a saved provider URL", async () => {
  const { persistRemoteMedia } = loadFunctions("../src/core/actions/fast-video.ts", ["persistRemoteMedia"], {
    fetch: async () => ({ ok: true, headers: { get: () => "video/mp4" }, arrayBuffer: async () => new Uint8Array([1]).buffer }),
  })
  const storage = { from: () => ({ upload: async () => ({ error: new Error("storage unavailable") }) }) }
  const result = await persistRemoteMedia({ storage }, { url: "https://provider.example/render.mp4", userId: "user", shotId: "shot", kind: "video" })
  assert.equal(result, null)
})

function exportHarness(items, fetchImpl) {
  const updates = []
  const db = {
    from(table) {
      let update = null
      const query = {
        select() { return query }, eq() { return query }, order() { return query },
        update(value) { update = value; return query },
        then(resolve) {
          if (update) updates.push({ table, ...update })
          resolve(table === "export_job_items" && !update ? { data: items, error: null } : { error: null })
        },
      }
      return query
    },
    storage: { from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: key => ({ data: { publicUrl: `https://storage.example/${key}` } }),
    }) },
  }
  const helpers = loadFunctions("../src/app/api/exports/worker/route.ts", ["extensionFromUrl", "extensionFromContentType", "isVideoExt", "processJob"], {
    join,
    mkdir: async () => {}, writeFile: async () => {}, cleanupTmpDir: async () => {},
    hasFfmpeg: async () => false,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, headers: { get: () => "video/mp4" }, arrayBuffer: async () => new Uint8Array([1]).buffer })),
  })
  return { db, updates, processJob: helpers.processJob }
}

test("multi-clip export fails rather than marking the first clip as the final sequence", async () => {
  const { db, updates, processJob } = exportHarness([
    { id: "a", source_url: "https://provider.example/a.mp4", order_index: 0 },
    { id: "b", source_url: "https://provider.example/b.mp4", order_index: 1 },
  ])
  const result = await processJob(db, "user", { id: "job", user_id: "user", project_id: "project", profile: "master_16_9" })
  assert.equal(result.ok, false)
  assert.equal(updates.at(-1).status, "failed")
  assert.equal(updates.at(-1).output_url, null)
})

test("single-clip export can complete with the uploaded asset", async () => {
  const { db, updates, processJob } = exportHarness([
    { id: "a", source_url: "https://provider.example/a.mp4", order_index: 0 },
  ])
  const result = await processJob(db, "user", { id: "job", user_id: "user", project_id: "project", profile: "master_16_9" })
  assert.equal(result.ok, true)
  assert.equal(updates.at(-1).status, "completed")
  assert.match(updates.at(-1).output_url, /item-1\.mp4$/)
})

test("network interruption marks the export failed instead of leaving it processing", async () => {
  const { db, updates, processJob } = exportHarness([
    { id: "a", source_url: "https://provider.example/a.mp4", order_index: 0 },
  ], async () => { throw new Error("network broke") })
  const result = await processJob(db, "user", { id: "job", user_id: "user", project_id: "project", profile: "master_16_9" })
  assert.equal(result.ok, false)
  assert.equal(updates.at(-1).status, "failed")
  assert.equal(updates.at(-1).output_url, null)
})

test("repeated export submission reuses the in-flight job and keeps selected order", async () => {
  let job = null
  let jobInserts = 0
  let savedItems = []
  const rows = {
    shot_generations: [
      { id: "second", shot_id: "shot-2", output_url: "https://storage.example/second.mp4", status: "completed" },
      { id: "first", shot_id: "shot-1", output_url: "https://storage.example/first.mp4", status: "completed" },
    ],
    shots: [{ id: "shot-1", scene_id: "scene" }, { id: "shot-2", scene_id: "scene" }],
    scenes: [{ id: "scene", project_id: "project" }],
    projects: [{ id: "project" }],
  }
  const db = { from(table) {
    let operation = "read"
    let payload
    const query = {
      select() { return query }, eq() { return query }, in() { return query },
      insert(value) { operation = "insert"; payload = value; return query },
      update(value) { operation = "update"; payload = value; return query },
      single() {
        if (table === "export_jobs" && operation === "insert") {
          jobInserts += 1
          if (job && ["preparing", "queued", "processing"].includes(job.status)) return Promise.resolve({ data: null, error: { code: "23505" } })
          job = { id: "export-1", ...payload }
          return Promise.resolve({ data: { id: job.id }, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      maybeSingle() { return Promise.resolve({ data: job ? { id: job.id } : null, error: null }) },
      then(resolve) {
        if (operation === "insert" && table === "export_job_items") savedItems = payload
        if (operation === "update" && table === "export_jobs") job = { ...job, ...payload }
        resolve({ data: rows[table] || null, error: null })
      },
    }
    return query
  } }
  const { queueGalleryExport } = loadFunctions("../src/core/actions/exports.ts", ["PROFILE_TO_FORMAT", "toProfile", "queueGalleryExport"], {
    createHash,
    ensureSession: async () => ({ supabase: db, user: { id: "user" } }),
  })
  const first = await queueGalleryExport(["first", "second"], "master_16_9")
  const repeated = await queueGalleryExport(["first", "second"], "master_16_9")
  assert.equal(first.data.jobCount, 1)
  assert.equal(repeated.data.reusedJobs, 1)
  assert.equal(jobInserts, 2)
  assert.deepEqual(Array.from(savedItems, item => item.shot_generation_id), ["first", "second"])
  assert.equal(job.status, "queued")
})

test("Kie readiness checks the balance response instead of accepting a fake task lookup", async () => {
  const makeValidator = response => loadFunctions("../src/core/actions/api-keys.ts", ["validateProviderKey"], { fetch: async () => response }).validateProviderKey
  const ready = await makeValidator({ ok: true, status: 200, json: async () => ({ code: 200, data: 10 }) })("kie", "test-key")
  assert.equal(ready.status, "valid")
  const empty = await makeValidator({ ok: true, status: 200, json: async () => ({ code: 200, data: 0 }) })("kie", "test-key")
  assert.equal(empty.status, "unavailable")
  const fakeTask = await makeValidator({ ok: false, status: 404 })("kie", "test-key")
  assert.equal(fakeTask.ok, false)
})
