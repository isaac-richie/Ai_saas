"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createProductionRevision, listProductions, materializeProduction, updateProduction } from "@/core/actions/production"
import { canApproveProduction, type ProductionPlan } from "@/core/validation/production-crew"
import { ProductionRunPanel } from "./ProductionRunPanel"
import { ArrowUpRight, Clapperboard, Plus, RefreshCw } from "lucide-react"
import styles from "./ProductionDesk.module.css"
import { ProductionReferences } from "./ProductionReferences"
import { productionAssetsSchema, type ProductionAsset } from "@/core/validation/production-assets"

type Production = { id: string; brief: string; status: "brief" | "awaiting_approval" | "approved"; plan: ProductionPlan | null; project_id?: string | null; scene_id?: string | null; sequence_id?: string | null; planning_stage?: "brief" | "story" | "departments" | "shots" | "complete"; revision_number?: number }
type ProductionView = "brief" | "direction" | "takes"

const PRODUCTION_DESK_STORAGE_KEY = "aisas.production-desk.v1"

export function ProductionDesk() {
  const [jobs, setJobs] = useState<Production[]>([])
  const [brief, setBrief] = useState("")
  const [assets, setAssets] = useState<ProductionAsset[]>([])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [ready, setReady] = useState(false)
  const [crewStatus, setCrewStatus] = useState("")
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<ProductionView>("brief")
  const [sessionRestored, setSessionRestored] = useState(false)
  const selected = jobs.find(job => job.id === selectedId)

  async function refresh() {
    const result = await listProductions()
    if (result.error) throw new Error(result.error)
    setJobs(result.data as Production[])
    setReady(true)
  }

  useEffect(() => {
    let active = true
    listProductions().then(result => {
      if (!active) return
      if (result.error) setError("Saved productions are temporarily unavailable.")
      else {
        const productions = result.data as Production[]
        let savedId: string | null = null
        let savedView: ProductionView = "brief"
        let hasSavedSession = false
        try {
          const raw = window.localStorage.getItem(PRODUCTION_DESK_STORAGE_KEY)
          const saved = raw ? JSON.parse(raw) as { brief?: string; selectedId?: string | null; view?: ProductionView; assets?: unknown } : null
          const restoredAssets = productionAssetsSchema.safeParse(saved?.assets)
          if (restoredAssets.success) setAssets(restoredAssets.data)
          hasSavedSession = Boolean(saved)
          if (typeof saved?.brief === "string") setBrief(saved.brief)
          if (typeof saved?.selectedId === "string") savedId = saved.selectedId
          if (saved?.view === "brief" || saved?.view === "direction" || saved?.view === "takes") savedView = saved.view
        } catch {
          // A malformed browser cache must never hide server-saved productions.
        }

        const restored = productions.find(job => job.id === savedId) || productions[0] || null
        setJobs(productions)
        setSelectedId(restored?.id || null)
        setView(restored ? (!hasSavedSession ? "direction" : savedView === "takes" && !restored.project_id ? "direction" : savedView) : "brief")
        setReady(true)
        setSessionRestored(true)
      }
    }).catch(() => { if (active) setError("Could not load productions. Please reload.") })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!sessionRestored) return
    try {
      window.localStorage.setItem(PRODUCTION_DESK_STORAGE_KEY, JSON.stringify({ brief, selectedId, view, assets }))
    } catch {
      // Server state remains authoritative when browser storage is unavailable.
    }
  }, [brief, selectedId, sessionRestored, view, assets])

  function keep(job: Production) {
    setJobs(current => [job, ...current.filter(item => item.id !== job.id)])
    setSelectedId(job.id)
    setView(job.project_id ? "takes" : "direction")
  }

  async function run(work: () => Promise<void>) {
    setBusy(true); setError("")
    try { await work() } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again.") }
    finally { setBusy(false); setCrewStatus("") }
  }

  async function developWithCrew(jobId: string) {
    for (let step = 0; step < 5; step += 1) {
      const response = await fetch("/api/ad/production-crew", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || "The director could not continue the plan.")
      setCrewStatus(result.message || "Finalizing production plan")
      await refresh()
      if (result.complete) {
        const refreshed = await listProductions()
        if (refreshed.error) throw new Error(refreshed.error)
        setJobs(refreshed.data as Production[])
        setCrewStatus("")
        return
      }
    }
    throw new Error("The crew paused after its latest checkpoint. Select Resume crew to continue.")
  }

  return (
    <section className={styles.desk} aria-label="Production Desk">
      <header className={styles.header}>
        <div><p className={styles.eyebrow}><Clapperboard size={15} /> THE PRODUCTION DESK</p><h2>Your vision.<br /><em>A crew to bring it to life.</em></h2><p className={styles.intro}>Shape the story. Direct the details. Make something worth watching.</p></div>
        <div className={styles.slate}><span>CREW / 07</span><strong>One shared vision.</strong><p>Story · Camera · Light<br />Design · Performance · Edit · Continuity</p></div>
      </header>
      <div className={styles.toolbar}>
        <label className={styles.projectPicker}>PRODUCTION<select aria-label="Choose production" value={selectedId || ""} disabled={busy} onChange={event => { const job = jobs.find(item => item.id === event.target.value); setSelectedId(job?.id || null); setView(job ? (job.project_id ? "takes" : "direction") : "brief") }}><option value="">Start a new film</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.plan?.crew?.bible.title || job.brief.slice(0, 64)} · v{job.revision_number || 1}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={() => { setSelectedId(null); setView("brief") }}><Plus size={16} /> New film</button>
        <button type="button" disabled={busy} onClick={() => void run(refresh)} aria-label="Refresh productions"><RefreshCw size={16} /></button>
      </div>
      <nav className={styles.steps} aria-label="Production stages">
        {(["brief", "direction", "takes"] as const).map((stage, index) => <button key={stage} type="button" aria-current={view === stage ? "step" : undefined} disabled={busy || (stage === "direction" && !selected) || (stage === "takes" && !selected?.project_id)} onClick={() => setView(stage)}><span>0{index + 1}</span>{stage === "brief" ? "The brief" : stage === "direction" ? "Creative direction" : "Takes & review"}</button>)}
        {selected?.sequence_id ? <Link href={`/dashboard/sequences/${selected.sequence_id}`}><span>04</span>Edit & deliver <ArrowUpRight size={14} /></Link> : <span className={styles.locked}><span>04</span>Edit & deliver</span>}
      </nav>
      <div className={styles.body}>
      {view === "brief" && <div className={styles.briefGrid}><div><p className={styles.eyebrow}>01 / THE STARTING POINT</p><h3>Every film starts<br />with a feeling.</h3><p>Tell us who we follow, where we are, and what changes. Your crew will develop three connected shots.</p><span className={styles.format}>3 SHOTS / 10 SECONDS EACH / 16:9</span></div>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        if (uploading) return
        const result = await updateProduction({ action: "create", brief, assets })
        if (result.error) throw new Error(result.error)
        keep(result.data as Production); setBrief(""); setAssets([])
      }) }}>
        <label htmlFor="production-brief" className="text-sm text-white/80">What should the audience feel?</label>
        <textarea id="production-brief" required minLength={8} maxLength={4000} value={brief} onChange={event => setBrief(event.target.value)} placeholder="A quiet fashion film at dawn. One protagonist, an ivory coat, and a city coming to life..." className="mt-2 min-h-28 w-full rounded-xl border border-white/15 bg-black/30 p-4 text-white placeholder:text-white/30" />
        <ProductionReferences assets={assets} onChange={setAssets} disabled={busy} onBusy={setUploading} />
        <button disabled={busy || !ready || uploading} className="mt-3 rounded-full bg-[#d6ede7] px-5 py-2 text-sm font-medium text-black disabled:opacity-40">{busy ? "Working..." : "Save film brief"}</button>
      </form></div>}
      {error && <p role="alert" className="mt-4 text-sm text-amber-200">{error}</p>}
      {busy && <div role="status" className={styles.progress}><span />{crewStatus || "Working on your production..."}<small>Completed stages are saved.</small></div>}
      {!ready && !error && <p role="status" className="mt-4 text-sm text-white/60">Loading your productions...</p>}
      <div aria-busy={busy}>
        {jobs.filter(job => job.id === selectedId && view !== "brief").map(job => <article key={job.id} className={styles.production}>
          <p className="text-xs uppercase tracking-widest text-white/40">{job.status.replaceAll("_", " ")} / version {job.revision_number || 1}</p>
          <h3 className={styles.productionTitle}>{job.plan?.crew?.bible.title || "Your film, in development."}</h3>
          <ProductionReferences assets={productionAssetsSchema.safeParse((job as Production & { reference_assets?: unknown }).reference_assets).data || []} />
          <details className="mt-3 text-sm text-white/60"><summary className="cursor-pointer">Read original brief</summary><p className="mt-3 whitespace-pre-wrap">{job.brief}</p></details>
          {view === "direction" && job.planning_stage && job.status === "brief" && <p className={styles.checkpoint}>Saved progress: {job.planning_stage === "brief" ? "Brief ready for the crew" : job.planning_stage === "story" ? "Story bible ready" : job.planning_stage === "departments" ? "Department direction ready" : "Shot prompts ready for review"}</p>}
          {view === "direction" && job.plan && <div className="mt-4">
            <p className="text-sm text-white/70">{job.plan.creativeStrategy}</p>
            {job.plan.crew && <details className="mt-4 rounded-xl border border-white/10 p-4">
              <summary className="cursor-pointer text-sm text-[#d6ede7]">Production bible and crew review</summary>
              <h4 className="mt-4 text-lg text-white">{job.plan.crew.bible.title}</h4>
              <p className="mt-2 text-sm text-white/70">{job.plan.crew.bible.audienceEmotion}</p>
              <p className="mt-2 text-sm text-white/70">{job.plan.crew.bible.world}</p>
              <ul className="mt-3 list-inside list-disc text-sm text-white/60">{job.plan.crew.bible.continuityAnchors.map((anchor, i) => <li key={i}>{anchor}</li>)}</ul>
              {job.plan.crew.bible.continuityLedger && <div className="mt-4 rounded-xl border border-[#d6ede7]/15 bg-[#d6ede7]/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[#d6ede7]">Locked continuity contract</p>
                <div className="mt-3 grid gap-2 text-xs text-white/65 sm:grid-cols-2">
                  <p><strong className="text-white/85">Identity</strong><br />{job.plan.crew.bible.continuityLedger.subjectIdentity}</p>
                  <p><strong className="text-white/85">Wardrobe</strong><br />{job.plan.crew.bible.continuityLedger.wardrobe}</p>
                  <p><strong className="text-white/85">Objects</strong><br />{job.plan.crew.bible.continuityLedger.heroObjects.join(", ") || "No hero object"}</p>
                  <p><strong className="text-white/85">World</strong><br />{job.plan.crew.bible.continuityLedger.location} · {job.plan.crew.bible.continuityLedger.environment}</p>
                  <p><strong className="text-white/85">Color and light</strong><br />{job.plan.crew.bible.continuityLedger.palette.join(", ")} · {job.plan.crew.bible.continuityLedger.lighting}</p>
                  <p><strong className="text-white/85">Screen geography</strong><br />{job.plan.crew.bible.continuityLedger.screenDirection}</p>
                </div>
              </div>}
              <div className={styles.departments}>{[
                { name: "Camera", direction: job.plan.crew.camera },
                { name: "Lighting", direction: job.plan.crew.lighting },
                { name: "Production design", direction: job.plan.crew.productionDesign },
                { name: "Performance", direction: job.plan.crew.performance },
              ].filter(department => department.direction).map(department => <details key={department.name}><summary>{department.name}</summary><p>{department.direction?.approach}</p>{department.direction?.shotDirections.map((direction, index) => <p key={index}><strong>Shot {index + 1}</strong> {direction}</p>)}</details>)}</div>
              {job.plan.crew.bible.assumptions.length > 0 && <p className="mt-3 text-sm text-white/60">Creative assumptions: {job.plan.crew.bible.assumptions.join(" ")}</p>}
              <p className="mt-4 text-sm text-white/80">Plan review: {job.plan.crew.review.summary}</p>
              {job.plan.crew.review.findings.map((finding, i) => <p key={i} className="mt-2 text-sm text-amber-200">Shot {finding.shotNumber} / {finding.severity}: {finding.evidence} {finding.correction}</p>)}
              <p className="mt-3 text-xs text-white/50">This review covers the written direction. Review generated footage in Takes & review.</p>
            </details>}
            <div className="mt-4 grid gap-3 lg:grid-cols-3">{job.plan.deliverables.map((shot, index) => <section key={`${shot.id}-${index}`} className="min-w-0 rounded-lg bg-white/5 p-4">
              <h4 className="text-sm font-medium text-white">{index + 1}. {shot.title}</h4>
              <p className="mt-2 text-xs text-white/50">{shot.modelFamilyId} / {shot.durationSeconds}s requested / {shot.aspectRatio}</p>
              <p className="mt-3 text-sm text-white/70">{shot.creatorDirection}</p>
              {shot.continuityStartState && <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/55"><p><strong className="text-white/80">Starts</strong> {shot.continuityStartState}</p><p className="mt-1"><strong className="text-white/80">Ends</strong> {shot.continuityEndState}</p><p className="mt-1"><strong className="text-white/80">Allowed changes</strong> {shot.intentionalChanges?.join(", ") || "None"}</p></div>}
              <details className="mt-3 text-xs text-white/60"><summary className="cursor-pointer">Shot prompt</summary><p className="mt-2 whitespace-pre-wrap">{shot.masterPrompt}</p></details>
            </section>)}</div>
          </div>}
          {job.status === "brief" && <button disabled={busy} className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={() => void run(async () => {
            await developWithCrew(job.id)
          })}>{job.planning_stage && job.planning_stage !== "brief" ? "Resume crew" : "Develop with crew"}</button>}
          {job.status === "awaiting_approval" && <button disabled={busy || !canApproveProduction(job.plan)} className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-40" onClick={() => void run(async () => {
            const result = await updateProduction({ action: "approve", id: job.id })
            if (result.error) throw new Error(result.error)
            keep(result.data as Production)
          })}>Approve direction</button>}
          {job.status === "awaiting_approval" && !canApproveProduction(job.plan) && <p className="mt-3 text-sm text-amber-200">The crew found a blocking issue. Use the review notes in a revised brief above to develop a new plan.</p>}
          {view === "direction" && job.status === "approved" && <p className="mt-4 text-sm text-[#d6ede7]">Direction approved. {job.project_id ? "Continue to Takes & review to direct your production." : "Create the workspace to begin generating your shots."}</p>}
          {view === "direction" && job.project_id && <button className="mt-4 rounded-full bg-[#d6ede7] px-5 py-2.5 text-sm font-medium text-black" onClick={() => setView("takes")}>Continue to takes</button>}
          {job.status === "approved" && !job.project_id && <button disabled={busy} className="mt-4 rounded-full bg-[#d6ede7] px-4 py-2 text-sm font-medium text-black disabled:opacity-40" onClick={() => void run(async () => {
            const result = await materializeProduction(job.id)
            if (result.error || !result.data) throw new Error(result.error || "Could not create workspace.")
            keep({ ...job, project_id: result.data.projectId, scene_id: result.data.sceneId, sequence_id: result.data.sequenceId })
          })}>Create production workspace</button>}
          {job.project_id && job.scene_id && <div className="mt-4 flex flex-wrap gap-3">
            <Link className="rounded-full bg-[#d6ede7] px-4 py-2 text-sm font-medium text-black" href={`/dashboard/projects/${job.project_id}/scenes/${job.scene_id}`}>Open shot workspace</Link>
            {job.sequence_id && <Link className="rounded-full border border-white/20 px-4 py-2 text-sm text-white" href={`/dashboard/sequences/${job.sequence_id}`}>Open first cut</Link>}
          </div>}
          {view === "takes" && job.project_id && job.scene_id && <ProductionRunPanel productionId={job.id} projectId={job.project_id} sceneId={job.scene_id} sequenceId={job.sequence_id} />}
          {job.status !== "brief" && <details className="mt-4 rounded-xl border border-white/10 p-3"><summary className="cursor-pointer text-xs text-white/55">Create a revised production direction</summary><textarea value={revisionNotes[job.id] || ""} onChange={event => setRevisionNotes(current => ({ ...current, [job.id]: event.target.value }))} maxLength={2000} placeholder="Keep the approved history and describe only what should change..." className="mt-3 min-h-20 w-full rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder:text-white/30" /><button disabled={busy || (revisionNotes[job.id] || "").trim().length < 8} className="mt-3 rounded-full border border-white/15 px-4 py-2 text-xs text-white disabled:opacity-40" onClick={() => void run(async () => { const result = await createProductionRevision({ productionId: job.id, direction: revisionNotes[job.id] || "" }); if (result.error || !result.data) throw new Error(result.error || "Could not create revision."); keep(result.data as Production); setRevisionNotes(current => ({ ...current, [job.id]: "" })) })}>Create versioned revision</button></details>}
        </article>)}
      </div>
      </div>
    </section>
  )
}
