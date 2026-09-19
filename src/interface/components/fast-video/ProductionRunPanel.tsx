"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { approveTake } from "@/core/actions/takes"
import { cancelGenerationJob } from "@/core/actions/generation-jobs"
import { listProductionShots, pollProductionGeneration, queueProductionShot } from "@/core/actions/production"
import { applyTakeCorrection, proposeTakeCorrection, recordTakeInspection, submitProductionEvaluation } from "@/core/actions/production-review"
import styles from "./ProductionDesk.module.css"
import { recoverFromStaleServerAction } from "@/interface/lib/server-action-recovery"
import { needsProductionTake } from "@/core/utils/production/retry-eligibility"

type Take = { id: string; take_number: number; status: string; output_url: string | null; model_version_used: string | null; review_status?: string; review_notes?: string | null; media_inspection?: unknown; first_frame_url?: string | null; last_frame_url?: string | null; created_at?: string }
type Job = { id: string; status: string; progress: number; error_message: string | null; provider_task_id: string | null; take_id: string | null; created_at?: string }
type Shot = { id: string; name: string; model: string | null; duration_target: number | null; approved_take_id: string | null; previous_shot_id: string | null; shot_generations: Take[]; generation_jobs: Job[] }
type Correction = { revisionId: string; revisedPrompt: string; changes: string[]; retainedAnchors: string[] }
const active = new Set(["queued", "preparing", "submitted", "generating", "downloading", "processing"])

export function ProductionRunPanel({ productionId, projectId, sceneId, sequenceId }: { productionId: string; projectId: string; sceneId: string; sequenceId?: string | null }) {
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  const [corrections, setCorrections] = useState<Record<string, Correction>>({})
  const [scores, setScores] = useState({ story: 5, continuity: 5, visual: 5, editability: 5, notes: "" })
  const [evaluationSaved, setEvaluationSaved] = useState(false)
  const [inspectingTake, setInspectingTake] = useState<string | null>(null)
  const [focusedShot, setFocusedShot] = useState<string | null>(null)
  const [focusedTakes, setFocusedTakes] = useState<Record<string, string>>({})
  const activeJobKey = shots
    .flatMap(shot => shot.generation_jobs.filter(job => active.has(job.status) && job.provider_task_id).map(job => job.id))
    .sort()
    .join(",")

  const refresh = useCallback(async () => {
    const result = await listProductionShots(productionId)
    if (result.error) setError(result.error)
    else { setShots(result.data as Shot[]); setError("") }
  }, [productionId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const ids = activeJobKey ? activeJobKey.split(",") : []
    if (!ids.length) return
    let polling = false
    const pollActiveJobs = async () => {
      if (polling) return
      polling = true
      try {
        await Promise.all(ids.map(id => pollProductionGeneration(id)))
        await refresh()
      } catch (cause) {
        if (!recoverFromStaleServerAction(cause)) setError("Status check interrupted. Existing generations are still tracked; retrying shortly.")
      } finally {
        polling = false
      }
    }
    void pollActiveJobs()
    const timer = window.setInterval(() => { void pollActiveJobs() }, 4000)
    return () => window.clearInterval(timer)
  }, [activeJobKey, refresh])

  async function generate(shotsToRun: Shot[], newTake = false) {
    setBusy(true); setError("")
    try {
      const results = await Promise.allSettled(shotsToRun.map(async shot => ({
        shot,
        result: await queueProductionShot({ productionId, shotId: shot.id, newTake }),
      })))
      results.forEach((outcome, index) => {
        if (outcome.status === "rejected") {
          if (!recoverFromStaleServerAction(outcome.reason)) toast.error(`${shotsToRun[index].name}: submission interrupted. Refresh its status before retrying.`)
          return
        }
        const { shot, result } = outcome.value
        if (result.error) toast.error(`${shot.name}: ${result.error}`)
      })
      await refresh()
    } catch (cause) {
      if (!recoverFromStaleServerAction(cause)) toast.error("Could not submit the production. Refresh and try again.")
    }
    finally { setBusy(false) }
  }

  async function proposeCorrection(take: Take) {
    const result = await proposeTakeCorrection({ takeId: take.id, reviewerNote: reviewNotes[take.id] || "" })
    if (result.error || !result.data) { toast.error(result.error || "Could not propose a correction"); return }
    setCorrections(current => ({ ...current, [take.id]: result.data as Correction }))
    toast.success("Correction prepared for review")
  }

  async function applyCorrection(takeId: string) {
    const proposal = corrections[takeId]
    if (!proposal) return
    const result = await applyTakeCorrection(proposal.revisionId)
    if (result.error) { toast.error(result.error); return }
    setCorrections(current => { const next = { ...current }; delete next[takeId]; return next })
    toast.success("Corrected prompt applied. Generate another take when ready.")
    await refresh()
  }

  async function inspectTake(takeId: string) {
    setInspectingTake(takeId)
    try {
      const response = await fetch(`/api/takes/${takeId}/inspect`, { method: "POST" })
      const result = await response.json()
      if (!response.ok || !result.ok) { toast.error(result.error || "Keyframe inspection failed"); return }
      toast.success("Keyframe continuity review saved")
      await refresh()
    } catch { toast.error("Could not inspect the take. Please try again.") }
    finally { setInspectingTake(null) }
  }

  const allApproved = shots.length > 0 && shots.every(shot => Boolean(shot.approved_take_id))
  const hasTakes = shots.some(shot => shot.shot_generations.length > 0)
  const hasApprovedContinuityFrame = (shot: Shot | undefined) => Boolean(shot?.approved_take_id && shot.shot_generations.some(take => take.id === shot.approved_take_id && take.last_frame_url && take.review_status !== "rejected"))
  const continuityReadyShots = shots.filter((shot, index) => needsProductionTake(shot) && (index === 0 || hasApprovedContinuityFrame(shots[index - 1])))
  const waitingForInspection = shots.some((shot, index) => index < shots.length - 1 && shot.approved_take_id && !hasApprovedContinuityFrame(shot))

  return <section className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h4 className="text-lg font-medium text-white">The screening room</h4><p className="mt-1 text-xs text-white/60">Watch each shot. Choose your take. {shots.filter(shot => shot.approved_take_id).length} of {shots.length} shots selected.</p></div>
      <button disabled={busy || !continuityReadyShots.length || shots.some(shot => shot.generation_jobs.some(job => active.has(job.status)))} onClick={() => void generate(continuityReadyShots)} className="rounded-full bg-[#d6ede7] px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{busy ? "Submitting..." : waitingForInspection ? "Inspect approved take to continue" : `${hasTakes ? "Generate next continuity take" : "Generate opening take"} (${continuityReadyShots.length} ${continuityReadyShots.length === 1 ? "credit" : "credits"})`}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
    <div className={styles.shotStrip} aria-label="Choose shot">{shots.map((shot, index) => <button type="button" key={shot.id} aria-pressed={(focusedShot || shots[0]?.id) === shot.id} onClick={() => setFocusedShot(shot.id)}><span>SHOT 0{index + 1}</span><strong>{shot.name}</strong><small>{shot.approved_take_id ? (index < shots.length - 1 && !hasApprovedContinuityFrame(shot) ? "Selected · inspect to continue" : "Take selected") : index > 0 && !hasApprovedContinuityFrame(shots[index - 1]) ? "Waiting for previous handoff" : shot.shot_generations.some(take => take.status === "completed") ? "Ready for review" : "Ready for footage"}</small></button>)}</div>
    <div className="mt-4">{shots.filter(shot => shot.id === (focusedShot || shots[0]?.id)).map(shot => {
      const jobs = [...shot.generation_jobs].sort((a, b) => (b.created_at || b.id).localeCompare(a.created_at || a.id)); const job = jobs[0]
      const takes = [...shot.shot_generations].sort((a, b) => b.take_number - a.take_number)
      const shotIndex = shots.findIndex(item => item.id === shot.id)
      const continuityBlocked = shotIndex > 0 && !hasApprovedContinuityFrame(shots[shotIndex - 1])
      return <article key={shot.id} className="rounded-lg border border-white/10 p-3">
        <p className="text-sm text-white">{shot.name}</p><p className="mt-1 text-xs text-white/45">{shot.model} / {shot.duration_target}s requested</p>
        {job && <div className="mt-3"><div className="h-1 overflow-hidden rounded bg-white/10"><i className="block h-full bg-[#d6ede7]" style={{ width: `${job.progress}%` }} /></div><p className="mt-2 text-xs text-white/55">{job.status}{job.error_message ? `: ${job.error_message}` : ""}</p></div>}
        {takes.length === 0 && <div className={styles.emptyScreen}><span>AWAITING FIRST TAKE</span><p>Your scene begins here.</p><small>Generate footage to open the screening room.</small></div>}
        {takes.length > 0 && <label className="mt-4 block text-xs text-white/65">Review take<select className="ml-3 rounded-lg border border-white/15 bg-[#141c17] p-2 text-white" value={focusedTakes[shot.id] || takes[0].id} onChange={event => setFocusedTakes(current => ({ ...current, [shot.id]: event.target.value }))}>{takes.map(take => <option value={take.id} key={take.id}>Take {take.take_number} · {take.status}{shot.approved_take_id === take.id ? " · selected" : ""}</option>)}</select></label>}
        {takes.filter(take => take.id === (focusedTakes[shot.id] || takes[0]?.id)).map(take => <div key={take.id} className="mt-3 rounded-lg bg-white/5 p-3 sm:p-5">
          <p className="text-xs text-white/60">Take {take.take_number} / {take.status}{shot.approved_take_id === take.id ? " / approved" : ""}</p>
          {take.output_url && <video className="mt-3 aspect-video max-h-[560px] w-full rounded-xl bg-black object-contain" src={take.output_url} controls playsInline preload="metadata" onLoadedMetadata={event => {
            if (take.media_inspection) return
            const video = event.currentTarget
            const safariVideo = video as HTMLVideoElement & { webkitAudioDecodedByteCount?: number }
            const audioDetected = typeof safariVideo.webkitAudioDecodedByteCount === "number" && safariVideo.webkitAudioDecodedByteCount > 0 ? true : null
            void recordTakeInspection({ takeId: take.id, duration: video.duration, width: video.videoWidth, height: video.videoHeight, audioDetected }).then(refresh)
          }} />}
          {take.review_status && take.review_status !== "pending" && <p className={`mt-2 text-xs ${take.review_status === "pass" ? "text-[#d6ede7]" : "text-amber-200"}`}>Metadata review: {take.review_status}{take.review_notes ? ` / ${take.review_notes}` : ""}</p>}
          {take.status === "completed" && <button disabled={inspectingTake === take.id} onClick={() => void inspectTake(take.id)} className="mt-2 text-xs text-white/55 disabled:opacity-40">{inspectingTake === take.id ? "Inspecting keyframes..." : "Inspect keyframes with crew"}</button>}
          {take.status === "completed" && shot.approved_take_id !== take.id && take.last_frame_url && take.review_status !== "rejected" && <button className="mt-2 text-xs text-[#d6ede7]" onClick={() => void approveTake(shot.id, take.id).then(async result => { if (result.error) toast.error(result.error); else await refresh() })}>Approve continuity-checked take</button>}
          {take.status === "completed" && !take.last_frame_url && <p className="mt-2 text-xs text-white/45">Inspect this take before approval so the crew can lock its ending frame.</p>}
          {take.status === "completed" && <details className="mt-3 rounded-lg border border-white/10 p-2"><summary className="cursor-pointer text-xs text-white/60">Request a corrected take</summary><textarea value={reviewNotes[take.id] || ""} onChange={event => setReviewNotes(current => ({ ...current, [take.id]: event.target.value }))} maxLength={1200} placeholder="Describe only what is visibly wrong: motion, continuity, framing, lighting..." className="mt-2 min-h-20 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-white placeholder:text-white/30" /><button disabled={(reviewNotes[take.id] || "").trim().length < 3} onClick={() => void proposeCorrection(take)} className="mt-2 text-xs text-[#d6ede7] disabled:opacity-40">Ask correction supervisor</button>{corrections[take.id] && <div className="mt-3 rounded-lg bg-black/30 p-3"><p className="text-xs text-white/80">Proposed prompt</p><p className="mt-2 whitespace-pre-wrap text-xs text-white/55">{corrections[take.id].revisedPrompt}</p><p className="mt-2 text-xs text-white/40">Changes: {corrections[take.id].changes.join(" ")}</p><button onClick={() => void applyCorrection(take.id)} className="mt-3 rounded-full bg-[#d6ede7] px-3 py-1.5 text-xs font-medium text-black">Apply to next take</button></div>}</details>}
        </div>)}
        {job && active.has(job.status) && <button className="mt-3 text-xs text-white/50" onClick={() => void cancelGenerationJob(job.id).then(refresh)}>Cancel tracking</button>}
        {(!job || !active.has(job.status)) && <button disabled={busy || continuityBlocked} className="mt-4 rounded-full border border-white/20 px-4 py-2 text-sm text-[#d6ede7] disabled:opacity-40" onClick={() => { setFocusedTakes(current => ({ ...current, [shot.id]: "" })); void generate([shot], true) }}>{continuityBlocked ? "Complete previous shot handoff first" : `Generate ${takes.length ? "another" : "first"} take for this shot`}</button>}
      </article>
    })}</div>
    {allApproved && <form className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4" onSubmit={event => { event.preventDefault(); void submitProductionEvaluation({ productionId, ...scores }).then(result => { if (result.error) toast.error(result.error); else { setEvaluationSaved(true); toast.success("Production scorecard saved") } }) }}><div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="text-sm text-white">Beta production scorecard</h5><p className="mt-1 text-xs text-white/45">Rate the approved cut evidence. This data guides crew improvements.</p></div><button disabled={evaluationSaved} className="rounded-full border border-white/15 px-4 py-2 text-xs text-white disabled:opacity-40">{evaluationSaved ? "Scorecard saved" : "Save scorecard"}</button></div><div className="mt-4 grid gap-3 sm:grid-cols-4">{(["story", "continuity", "visual", "editability"] as const).map(key => <label key={key} className="text-xs capitalize text-white/50">{key}<select value={scores[key]} onChange={event => setScores(current => ({ ...current, [key]: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-white">{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} / 5</option>)}</select></label>)}</div><textarea value={scores.notes} onChange={event => setScores(current => ({ ...current, notes: event.target.value }))} maxLength={2000} placeholder="Optional production notes" className="mt-3 min-h-16 w-full rounded-lg border border-white/10 bg-black/30 p-2 text-xs text-white placeholder:text-white/30" /></form>}
    <div className="mt-4 flex flex-wrap gap-3"><Link className="text-xs text-[#d6ede7]" href={`/dashboard/projects/${projectId}/scenes/${sceneId}`}>Review shots</Link>{sequenceId && <Link className="text-xs text-[#d6ede7]" href={`/dashboard/sequences/${sequenceId}`}>Edit first cut</Link>}</div>
  </section>
}
