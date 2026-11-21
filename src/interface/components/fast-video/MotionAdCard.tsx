"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Clapperboard, Copy, ImagePlus, Loader2, RotateCcw, Sparkles, Trash2, Upload } from "@/interface/components/ui/icons"
import { createClient } from "@/infrastructure/supabase/client"
import {
  approveMotionAd, createMotionAd, deleteMotionAd, getMotionAd, planMotionAd, registerMotionAsset, requestFinalRender, retryMotionAd, updateMotionAd,
  type MotionAdView,
} from "@/core/actions/motion-ads"
import { UPLOADS, type UploadKind } from "@/core/services/motion-ad/state"

export type MotionAdActions = {
  create: typeof createMotionAd; update: typeof updateMotionAd; get: typeof getMotionAd; plan: typeof planMotionAd
  register: typeof registerMotionAsset; approve: typeof approveMotionAd; final: typeof requestFinalRender; retry: typeof retryMotionAd
  remove: typeof deleteMotionAd; upload: (file: File, adId: string, kind: UploadKind) => Promise<string>
}

/** Uploads straight to the creator's own folder for this ad; the server then reads and checks the file. */
async function uploadAdFile(file: File, adId: string, kind: UploadKind): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  const rule = UPLOADS[kind]
  if (!(rule.exts as readonly string[]).includes(ext)) throw new Error(`Use ${rule.label}.`)
  if (file.size > rule.maxBytes) throw new Error(`That file is too large. Use ${rule.label}.`)
  const db = createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error("Please sign in again.")
  const path = `${user.id}/motion-ads/${adId}/${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage.from("elements").upload(path, file, { contentType: file.type || undefined, upsert: false })
  if (error) throw new Error("The upload didn't finish. Try again.")
  return path
}

const DEFAULT_ACTIONS: MotionAdActions = {
  create: createMotionAd, update: updateMotionAd, get: getMotionAd, plan: planMotionAd, register: registerMotionAsset,
  approve: approveMotionAd, final: requestFinalRender, retry: retryMotionAd, remove: deleteMotionAd, upload: uploadAdFile,
}

const STORAGE_KEY = "visiowave.motion-ad.current"
const WORKING = new Set(["planning", "building", "final_rendering"])
const key = () => crypto.randomUUID()
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`
const field = "studio-field w-full rounded-xl text-[13.5px] text-white placeholder:text-white/35"
const chip = "rounded-full border px-2 py-0.5 text-[10.5px]"

/**
 * Make a motion ad: plan a storyboard from a brief, add the images and voice, approve, preview, then the
 * final render. Nothing renders until the storyboard is approved; the voice file sets the length.
 */
export function MotionAdCard({ actions = DEFAULT_ACTIONS, isFree = true }: { actions?: MotionAdActions; isFree?: boolean }) {
  const [ad, setAd] = useState<MotionAdView | null>(null)
  const [brief, setBrief] = useState("")
  const [lengthS, setLengthS] = useState<10 | 15 | 20>(15)
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9")
  const [resolution, setResolution] = useState<"1080p" | "4k">("1080p")
  const [rights, setRights] = useState(false)
  const [rightsBanner, setRightsBanner] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmFinal, setConfirmFinal] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const fileFor = useRef<{ kind: UploadKind; tag?: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const show = useCallback((next: MotionAdView) => {
    setAd(next)
    setBrief(next.brief); setLengthS(next.lengthS); setAspect(next.aspect); setResolution(next.resolution)
    try { localStorage.setItem(STORAGE_KEY, next.id) } catch { /* storage blocked: the ad is still saved */ }
  }, [])

  // Pick up where the creator left off.
  useEffect(() => {
    let id: string | null = null
    try { id = localStorage.getItem(STORAGE_KEY) } catch { /* ignore */ }
    if (!id) return
    actions.get(id).then((r) => { if (r.data) show(r.data) }).catch(() => undefined)
  }, [actions, show])

  // While a job runs elsewhere, check on it every few seconds.
  useEffect(() => {
    if (!ad || !WORKING.has(ad.state) || busy) return
    const timer = setInterval(() => { actions.get(ad.id).then((r) => { if (r.data) show(r.data) }).catch(() => undefined) }, 4000)
    return () => clearInterval(timer)
  }, [ad, busy, actions, show])

  const run = async (label: string, work: () => Promise<{ data?: MotionAdView; error?: string; needsRights?: boolean } | void>) => {
    if (busy) return
    setBusy(label); setError(null)
    try {
      const r = await work()
      if (r && r.error) { setError(r.error); if (r.needsRights) setRightsBanner(true) }
      if (r && r.data) show(r.data)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Try again.")
    } finally { setBusy(null) }
  }

  const ensureAd = async () => {
    if (ad) return ad
    const r = await actions.create({ brief, lengthS, aspect, resolution })
    if (!r.data) throw new Error(r.error || "Couldn't start the ad.")
    show(r.data)
    return r.data
  }

  const plan = () => run("plan", async () => {
    const current = await ensureAd()
    if (current.brief !== brief || current.lengthS !== lengthS || current.aspect !== aspect || current.resolution !== resolution) {
      const saved = await actions.update({ id: current.id, brief, lengthS, aspect, resolution })
      if (saved.error) return saved
    }
    return actions.plan({ id: current.id })
  })

  const pick = (kind: UploadKind, tag?: string) => {
    fileFor.current = { kind, tag }
    // Set the accepted types now: the picker opens straight away, before any re-render.
    if (input.current) input.current.accept = kind === "voice" ? "audio/*,.mp3,.m4a,.aac,.wav,.ogg" : "image/png,image/jpeg,image/webp"
    input.current?.click()
  }
  const onFile = (file: File | undefined) => {
    const target = fileFor.current
    if (!file || !target || !ad) return
    void run(`upload-${target.tag ?? target.kind}`, async () => {
      const path = await actions.upload(file, ad.id, target.kind)
      return actions.register({ id: ad.id, kind: target.kind, storagePath: path, tag: target.tag })
    })
  }

  const approve = () => {
    if (!rights) { setRightsBanner(true); setError(null); return }
    void run("approve", async () => (ad ? actions.approve({ id: ad.id, rightsAccepted: true, idempotencyKey: key() }) : undefined))
  }

  const copy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800) } catch { setError("Couldn't copy. Select the text and copy it yourself.") }
  }

  const latest = ad?.versions[0]
  const planReady = Boolean(ad?.plan)
  const editable = !ad || ["draft", "awaiting_assets", "awaiting_approval", "failed"].includes(ad.state)
  const units = ad?.finalUnits[resolution] ?? 0
  const warningFor = (tag: string) => ad?.warnings.find((w) => w.tag === tag)

  return (
    <details className="group/motion -mx-2 rounded-xl transition-colors open:bg-white/[0.02]" data-testid="motion-ad-card">
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-gold-300"><Clapperboard className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-medium text-[#ece6d6]">Make a motion ad</span>
          <span className="block text-[12.5px] text-[#9aa1ab]">Motion · Turn your images and voice into an animated ad</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-[#9aa1ab] transition-transform duration-300 group-open/motion:rotate-180" />
      </summary>

      <div className="space-y-4 px-2 pb-3 pt-1">
        <input ref={input} type="file" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />

        {/* Brief and settings */}
        <div className="space-y-2">
          <label htmlFor="motion-brief" className="text-[12px] font-medium text-[#B0B8C4]">Your product or brief</label>
          <textarea id="motion-brief" value={brief} disabled={!editable} onChange={(e) => setBrief(e.target.value)} maxLength={2000}
            placeholder="What are you advertising, who is it for, where will it be seen, and what should viewers do next?"
            className={`${field} min-h-20 resize-none p-3`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="radiogroup" aria-label="Length" className="flex gap-1 rounded-xl border border-line p-1 text-[12px]">
              {([10, 15, 20] as const).map((s) => (
                <button key={s} type="button" role="radio" aria-checked={lengthS === s} disabled={!editable} onClick={() => setLengthS(s)}
                  className={`rounded-lg px-3 py-1.5 ${lengthS === s ? "bg-white/10 text-white" : "text-[#9aa3ad] hover:text-white"}`}>{s}s</button>
              ))}
            </div>
            <details className="text-[12px] text-[#9aa1ab]">
              <summary className="cursor-pointer select-none">Advanced · {resolution === "4k" ? "4K" : "1080p"} · {aspect}</summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["1080p", "4k"] as const).map((r) => <button key={r} type="button" disabled={!editable} aria-pressed={resolution === r} onClick={() => setResolution(r)} className={`${chip} ${resolution === r ? "border-gold-300/60 text-gold-50" : "border-white/15"}`}>{r === "4k" ? "4K" : r}</button>)}
                {(["16:9", "9:16"] as const).map((a) => <button key={a} type="button" disabled={!editable} aria-pressed={aspect === a} onClick={() => setAspect(a)} className={`${chip} ${aspect === a ? "border-gold-300/60 text-gold-50" : "border-white/15"}`}>{a}</button>)}
              </div>
            </details>
          </div>
          {ad?.voice && <p className="text-[12px] text-[#9aa1ab]">Length follows your voice file: {ad.voice.durationS.toFixed(1)} s.</p>}
          <button type="button" onClick={() => void plan()} disabled={Boolean(busy) || !editable || brief.trim().length < 8}
            className={planReady
              ? "flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-[13px] font-medium text-[#ece6d6] hover:border-gold-300/50 disabled:opacity-45"
              : "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[13.5px] font-semibold text-[#1a160e] disabled:opacity-45"}>
            {busy === "plan" || ad?.state === "planning" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy === "plan" || ad?.state === "planning" ? "Planning your storyboard…" : planReady ? "Plan the storyboard again" : "Plan storyboard"}
          </button>
          {!planReady && <p className="text-[12px] text-[#7f8792]">You can plan before adding any images. Nothing is rendered until you approve the storyboard.</p>}
        </div>

        {ad?.notice && <p role="status" className="rounded-xl border border-gold-300/25 bg-gold-300/[0.05] p-3 text-[12.5px] text-gold-100">{ad.notice}</p>}

        {/* Storyboard */}
        {ad?.plan && (
          <section aria-label="Storyboard" className="space-y-2">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-gold-300/80">Storyboard · {ad.plan.total_s.toFixed(1)} s</p>
            <ol className="space-y-2">
              {ad.plan.shots.map((shot) => {
                const tag = `@image${shot.idx}`
                const image = ad.images.find((i) => i.tag === tag)
                const prompt = ad.plan!.images_needed.find((n) => n.shot === shot.idx)?.prompt
                const warn = warningFor(tag)
                const last = shot.idx === ad.plan!.shots.length
                return (
                  <li key={shot.idx} className="rounded-xl border border-line bg-white/[0.02] p-2.5">
                    <div className="flex gap-3">
                      <button type="button" disabled={Boolean(busy) || !editable} onClick={() => pick("image", tag)} aria-label={image ? `Replace image for shot ${shot.idx}` : `Add image for shot ${shot.idx}`}
                        className={`relative grid aspect-video w-28 shrink-0 self-start place-items-center overflow-hidden rounded-lg border ${image ? "border-line" : "border-dashed border-white/20"} bg-black/30 text-[#9aa1ab] enabled:hover:border-gold-300/50 disabled:cursor-default`}>
                        {image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={image.url} alt="" className="size-full object-cover" />
                          : busy === `upload-${tag}` ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                        <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[9.5px] text-white/80">{tag}</span>
                      </button>
                      <div className="min-w-0 flex-1 space-y-1 text-[12px]">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-white">{String(shot.idx).padStart(2, "0")} {shot.name}</span>
                          <span className="tabular-nums text-[#9aa1ab]">{clock(shot.start_s)}–{clock(shot.end_s)}</span>
                          <span className={`${chip} border-gold-300/30 text-gold-200`}>{last ? "End card" : `Turns into ${shot.turns_into}`}</span>
                        </div>
                        {shot.on_screen && <p className="font-serif text-[14px] text-[#f3eee2]">{shot.on_screen}</p>}
                        <p className="text-[#9aa1ab]">{shot.motion}</p>
                        {warn && <p className={`${chip} inline-block border-amber-300/40 text-amber-100`} title={warn.message}>Image too small for {resolution === "4k" ? "4K" : "this size"}. Suits {warn.maxResolution}.</p>}
                        {!image && prompt && (
                          <div className="rounded-lg bg-black/25 p-2 text-[11.5px] text-[#b0b8c4]">
                            <p>Make this in Quick Show (Output type: Image), then add it here:</p>
                            <p className="mt-1 text-white/85">{prompt}</p>
                            <button type="button" onClick={() => void copy(prompt, tag)} className="mt-1.5 inline-flex items-center gap-1 text-gold-200">{copied === tag ? <Check className="size-3" /> : <Copy className="size-3" />}{copied === tag ? "Copied" : "Copy prompt"}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>

            {/* Voice and logo */}
            <div className="space-y-2 rounded-xl border border-line bg-white/[0.02] p-2.5 text-[12px]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">Voiceover</p>
                  <p className="mt-1 text-[#d9d4c7]">“{ad.plan.voiceover.script}”</p>
                  <p className="mt-1 text-[#9aa1ab]">Delivery: {ad.plan.voiceover.delivery}. Make it in ElevenLabs, then add the file. Its length sets the ad&apos;s length.</p>
                  <button type="button" onClick={() => void copy(ad.plan!.voiceover.script, "script")} className="mt-1.5 inline-flex items-center gap-1 text-gold-200">{copied === "script" ? <Check className="size-3" /> : <Copy className="size-3" />}{copied === "script" ? "Copied" : "Copy script"}</button>
                </div>
                <button type="button" disabled={Boolean(busy) || !editable} onClick={() => pick("voice")} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[#ece6d6] enabled:hover:border-gold-300/50 disabled:opacity-40">
                  {busy === "upload-voice" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}{ad.voice ? `Voice · ${ad.voice.durationS.toFixed(1)} s` : "Add voice file"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-2">
                <p className="text-white">Logo <span className="text-[#9aa1ab]">· the real file, shown on the end card</span></p>
                <button type="button" disabled={Boolean(busy) || !editable} onClick={() => pick("logo")} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-[#ece6d6] enabled:hover:border-gold-300/50 disabled:opacity-40">
                  {busy === "upload-logo" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}{ad.logo ? "Replace logo" : "Add logo"}
                </button>
              </div>
            </div>

            {/* Approve */}
            {(ad.state === "awaiting_approval" || ad.state === "awaiting_assets") && (
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-[12.5px] text-white/85">
                  <input type="checkbox" checked={rights} onChange={(e) => { setRights(e.target.checked); if (e.target.checked) setRightsBanner(false) }} className="mt-0.5" />
                  I have the right to use these assets.
                </label>
                {rightsBanner && <p role="alert" className="rounded-lg border border-amber-300/50 bg-amber-300/[0.1] p-2 text-[12px] text-amber-100">Confirm you have the right to use these assets.</p>}
                <button type="button" onClick={approve} disabled={Boolean(busy) || ad.state !== "awaiting_approval"}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[13.5px] font-semibold text-[#1a160e] disabled:opacity-45">
                  {busy === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}Approve storyboard
                </button>
                {ad.state === "awaiting_assets" && <p className="text-[12px] text-[#9aa1ab]">{ad.plan.shots.filter((x) => !ad.images.some((i) => i.tag === `@image${x.idx}`)).length} of {ad.plan.shots.length} shots still need an image before you can approve.</p>}
              </div>
            )}
          </section>
        )}

        {/* Building, preview, final */}
        {ad && (ad.state === "building" || ad.state === "final_rendering") && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-line bg-white/[0.03] p-3 text-[12.5px] text-[#d9d4c7]">
            <Loader2 className="size-4 animate-spin text-gold-200" />
            {ad.state === "building" ? "Building your preview… You can leave this page; it keeps going." : `Rendering the final ${ad.resolution === "4k" ? "4K" : "1080p"} file… You can leave this page.`}
            {ad.job && ad.job.attempt > 1 ? " Retrying once." : ""}
          </p>
        )}
        {latest?.previewUrl && (ad?.state === "preview_ready" || ad?.state === "final_rendering" || ad?.state === "done") && (
          <section aria-label="Preview" className="space-y-2">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-gold-300/80">{ad.state === "done" && latest.finalUrl ? "Final" : "Preview"} · version {latest.n}</p>
            <video src={ad.state === "done" && latest.finalUrl ? latest.finalUrl : latest.previewUrl} controls playsInline className="w-full rounded-xl bg-black" />
            <p className="text-[11.5px] text-[#7f8792]">Watch and listen at full speed before you publish: checks can&apos;t hear a mix.</p>
            {ad.state === "preview_ready" && (
              confirmFinal ? (
                <div className="space-y-2 rounded-xl border border-gold-300/30 bg-gold-300/[0.05] p-3 text-[12.5px] text-gold-100">
                  <p>The final {resolution === "4k" ? "4K" : "1080p"} render uses <strong>{units} generations</strong>.{isFree ? " Free-tier exports carry the Visiowave watermark." : ""}</p>
                  <div className="flex gap-2">
                    <button type="button" autoFocus disabled={Boolean(busy)} onClick={() => void run("final", async () => { setConfirmFinal(false); return actions.final({ id: ad.id, resolution, shownUnits: units, idempotencyKey: key() }) })} className="rounded-lg bg-gold-200 px-3 py-1.5 font-semibold text-[#1a160e]">Confirm · {units} generations</button>
                    <button type="button" onClick={() => setConfirmFinal(false)} className="rounded-lg px-3 py-1.5 text-white/60">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {(["1080p", "4k"] as const).map((r) => <button key={r} type="button" aria-pressed={resolution === r} onClick={() => setResolution(r)} className={`${chip} ${resolution === r ? "border-gold-300/60 text-gold-50" : "border-white/15 text-[#9aa1ab]"}`}>{r === "4k" ? "4K" : r} · {ad.finalUnits[r]} generations</button>)}
                  <button type="button" onClick={() => setConfirmFinal(true)} className="ml-auto rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] px-4 py-2 text-[13px] font-semibold text-[#1a160e]">Final render</button>
                </div>
              )
            )}
            {ad.state === "done" && latest.finalUrl && (
              <div className="flex flex-wrap gap-2 text-[12.5px]">
                <a href={`${latest.finalUrl}?download=motion-ad-v${latest.n}.mp4`} className="rounded-lg border border-gold-300/50 px-3 py-1.5 text-gold-100">Download MP4</a>
                {latest.silentUrl && <a href={`${latest.silentUrl}?download=motion-ad-v${latest.n}-silent.mp4`} className="rounded-lg border border-white/15 px-3 py-1.5 text-[#ece6d6]">Silent master</a>}
                {latest.stemUrl && <a href={`${latest.stemUrl}?download=motion-ad-v${latest.n}-voice.${latest.stemUrl.split(".").pop()}`} className="rounded-lg border border-white/15 px-3 py-1.5 text-[#ece6d6]">Audio stem</a>}
              </div>
            )}
          </section>
        )}

        {ad?.state === "failed" && (
          <button type="button" disabled={Boolean(busy)} onClick={() => void run("retry", () => actions.retry({ id: ad.id, idempotencyKey: key() }))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] text-[#ece6d6]">
            <RotateCcw className="size-3.5" /> Try again
          </button>
        )}
        {error && <p role="alert" className="text-[12.5px] text-amber-200">{error}</p>}

        {ad && (
          <div className="flex justify-between border-t border-white/[0.06] pt-2 text-[12px]">
            {!confirmDelete && <button type="button" disabled={Boolean(busy) || WORKING.has(ad.state)} onClick={() => { setConfirmDelete(false); setAd(null); setBrief(""); setRights(false); try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } }} className="text-gold-200">Start a new motion ad</button>}
            {confirmDelete ? (
              <span className="ml-auto inline-flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Confirm delete">
                <span className="text-rose-100">Delete this ad and its renders? This can&apos;t be undone.</span>
                <button type="button" autoFocus disabled={Boolean(busy)} onClick={() => void run("delete", async () => { setConfirmDelete(false); const r = await actions.remove({ id: ad.id }); if (r.data) { setAd(null); setBrief(""); setRights(false); setConfirmFinal(false); try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ } } return { error: r.error } })} className="rounded-md bg-rose-300/90 px-2 py-0.5 font-semibold text-[#1a0e0e]">Delete</button>
                <button type="button" onClick={() => setConfirmDelete(false)} className="text-white/60">Keep</button>
              </span>
            ) : (
              <button type="button" disabled={Boolean(busy) || WORKING.has(ad.state)} onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 text-[#9aa1ab] enabled:hover:text-rose-200 disabled:opacity-40"><Trash2 className="size-3.5" /> Delete</button>
            )}
          </div>
        )}
      </div>
    </details>
  )
}
