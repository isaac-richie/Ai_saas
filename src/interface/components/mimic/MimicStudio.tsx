"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Box, Check, Clock, Download, Film, Loader2, Pencil, Plus, ShieldCheck, Sparkles, Trash2, Upload, User } from "lucide-react"
import { FilmReel, UploadSimple, VideoCamera } from "@phosphor-icons/react"
import {
  createMimicTask, deleteMimicTask, duplicateMimicTask, generateMimic, listMimicTasks, refreshMimic, releaseUnconfirmedMimic, saveMimicTask, saveMimicToVideos,
  type MimicTaskView,
} from "@/core/actions/mimic"
import { getGalleryAssets } from "@/core/actions/gallery"
import {
  MAX_MIMIC_ASSIGNMENTS, MAX_MIMIC_INSTRUCTION_CHARS, MAX_MIMIC_SOURCE_MS, MIMIC_CAPABILITY, MIMIC_STATUS_LABELS,
  mimicSummary, planMimicRequest, type MimicAssignment, type MimicAudioPolicy, type MimicResolution, type MimicSettings, type MimicStatus,
} from "@/core/services/mimic"
import { normalizeReferenceImage } from "@/interface/components/fast-video/normalize-image"
import { uploadReferenceFile } from "@/interface/components/fast-video/upload-reference"
import { MimicRecorder } from "./MimicRecorder"
import { MimicTrimmer } from "./MimicTrimmer"
import { MimicCompare } from "./MimicCompare"
import { MimicCastCard, castColour } from "./MimicCast"
import styles from "./mimic.module.css"

/** The server calls the page makes; the dev preview passes stand-ins. */
export type MimicActions = {
  list: typeof listMimicTasks
  create: typeof createMimicTask
  save: typeof saveMimicTask
  generate: typeof generateMimic
  refresh: typeof refreshMimic
  duplicate: typeof duplicateMimicTask
  release: typeof releaseUnconfirmedMimic
  remove: typeof deleteMimicTask
  saveToVideos: typeof saveMimicToVideos
  uploadFile: (file: File) => Promise<string>
  libraryVideos: () => Promise<{ id: string; url: string; name: string }[]>
}

export const DEFAULT_MIMIC_ACTIONS: MimicActions = {
  list: listMimicTasks, create: createMimicTask, save: saveMimicTask, generate: generateMimic, refresh: refreshMimic, duplicate: duplicateMimicTask,
  release: releaseUnconfirmedMimic, remove: deleteMimicTask, saveToVideos: saveMimicToVideos, uploadFile: uploadReferenceFile,
  libraryVideos: async () => {
    const result = await getGalleryAssets()
    return (result.data ?? []).filter(asset => asset.type === "video" && asset.url).slice(0, 60).map(asset => ({ id: asset.id, url: asset.url, name: asset.shotName || "Video" }))
  },
}

const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024

type Draft = { trimStartMs: number; trimEndMs: number; assignments: MimicAssignment[]; instructions: string; audioPolicy: MimicAudioPolicy; resolution: MimicResolution }
type TaskResult = { data?: MimicTaskView; error?: string }
type SourceState = { state: "idle" } | { state: "uploading" | "preparing"; name: string } | { state: "failed"; text: string; retry?: () => void }

const draftOf = (task: MimicTaskView): Draft => ({
  trimStartMs: task.trimStartMs, trimEndMs: task.trimEndMs, assignments: task.assignments, instructions: task.instructions, audioPolicy: task.audioPolicy, resolution: task.resolution,
})
const newAssignment = (targetType: MimicAssignment["targetType"]): MimicAssignment => ({ id: crypto.randomUUID(), label: "", targetType, target: "", referenceUrls: [], instructions: "" })
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const sec = (ms: number) => `${Number((ms / 1000).toFixed(1))} s`
const elapsed = (from: string | null, now: number) => {
  if (!from) return ""
  const s = Math.max(0, Math.round((now - Date.parse(from)) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

const STATUS_TONE: Record<MimicStatus, string> = {
  ready: "border-white/15 text-white/70", queued: "border-gold-300/40 text-gold-100", generating: "border-gold-300/40 text-gold-100",
  completed: "border-[#8fd1b9]/40 text-[#bfe9da]", failed: "border-red-300/40 text-red-200", unknown: "border-amber-300/40 text-amber-100",
}
function StatusPill({ status }: { status: MimicStatus }) {
  const working = status === "queued" || status === "generating"
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border bg-black/40 px-2.5 py-0.5 text-[11px] ${STATUS_TONE[status]}`} data-testid="mimic-status">
      {working ? <Loader2 className="size-3 animate-spin" aria-hidden /> : status === "completed" ? <Check className="size-3" aria-hidden /> : null}
      {MIMIC_STATUS_LABELS[status]}
    </span>
  )
}

export function MimicStudio({ actions = DEFAULT_MIMIC_ACTIONS }: { actions?: MimicActions }) {
  const [tasks, setTasks] = useState<MimicTaskView[]>([])
  const [loaded, setLoaded] = useState<{ available: boolean; multiSubject: boolean } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [sourceTab, setSourceTab] = useState<"record" | "upload" | "library">("record")
  const [source, setSource] = useState<SourceState>({ state: "idle" })
  const [dropping, setDropping] = useState(false)
  const [library, setLibrary] = useState<{ id: string; url: string; name: string }[] | null>(null)
  const [busy, setBusy] = useState<null | "save" | "generate" | "other">(null)
  const [rights, setRights] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const [uploadingRef, setUploadingRef] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const fileInput = useRef<HTMLInputElement>(null)
  const top = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLVideoElement>(null)

  const selected = tasks.find(task => task.id === selectedId) ?? null
  const editable = selected?.status === "ready" || selected?.status === "failed"
  const working = selected?.status === "queued" || selected?.status === "generating"
  const put = useCallback((task: MimicTaskView) => setTasks(list => list.some(t => t.id === task.id) ? list.map(t => t.id === task.id ? task : t) : [task, ...list]), [])

  useEffect(() => {
    let cancelled = false
    void actions.list().then(result => {
      if (cancelled) return
      if (result.error || !result.data) { setMessage({ tone: "error", text: result.error || "Could not load your Mimic takes." }); setLoaded({ available: true, multiSubject: false }); return }
      setTasks(result.data.tasks)
      setLoaded({ available: result.data.available, multiSubject: result.data.multiSubject })
    }).catch(() => { if (!cancelled) setLoaded({ available: true, multiSubject: false }) })
    return () => { cancelled = true }
  }, [actions])

  // Takes the provider is working on are checked in the background; there is no progress to invent.
  const generatingIds = tasks.filter(task => task.status === "generating").map(task => task.id).join(",")
  useEffect(() => {
    if (!generatingIds) return
    const poll = window.setInterval(() => {
      for (const taskId of generatingIds.split(",")) void actions.refresh({ taskId }).then(result => { if (result.data) put(result.data) }).catch(() => undefined)
    }, 8000)
    const clock = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { window.clearInterval(poll); window.clearInterval(clock) }
  }, [generatingIds, actions, put])

  function select(task: MimicTaskView | null) {
    setSelectedId(task?.id ?? null)
    setDraft(task ? draftOf(task) : null)
    setDirty(false)
    setRights(false)
    setMessage(null)
    setPlayhead(null)
    // Picking a take from the shelf at the bottom brings it into view, rather than leaving you mid-page.
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const change = (patch: Partial<Draft>) => { setDraft(d => d ? { ...d, ...patch } : d); setDirty(true); setMessage(null) }
  const changeAssignment = (id: string, patch: Partial<MimicAssignment>) => {
    // Only the edited change is touched; the others keep everything they had.
    setDraft(d => d ? { ...d, assignments: d.assignments.map(a => a.id === id ? { ...a, ...patch } : a) } : d)
    setDirty(true)
    setMessage(null)
  }

  /** A recording or upload becomes a take only after the server has prepared it. */
  async function addSource(file: File, origin: "recorded" | "uploaded") {
    if (!VIDEO_TYPES.includes(file.type)) { setSource({ state: "failed", text: `${file.name} isn't an MP4, MOV or WebM video.` }); return }
    if (!file.size || file.size > MAX_UPLOAD_BYTES) { setSource({ state: "failed", text: `${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB. Takes must be under 80 MB.` }); return }
    const retry = () => void addSource(file, origin)
    setSource({ state: "uploading", name: file.name })
    try {
      const url = await actions.uploadFile(file)
      await prepare(url, file.name, origin, retry)
    } catch (cause) {
      setSource({ state: "failed", text: cause instanceof Error ? cause.message : "The upload did not finish.", retry })
    }
  }
  async function prepare(url: string, name: string, origin: "recorded" | "uploaded" | "library", retry?: () => void) {
    setSource({ state: "preparing", name })
    const result = await actions.create({ url, name: name.slice(0, 160), origin }).catch((): TaskResult => ({ error: "The take could not be prepared. Check your connection and try again." }))
    if (result.error || !result.data) { setSource({ state: "failed", text: result.error || "The take could not be prepared.", retry }); return }
    setSource({ state: "idle" })
    put(result.data)
    select(result.data)
  }
  async function openLibrary() {
    setSourceTab("library")
    if (library) return
    setLibrary(await actions.libraryVideos().catch(() => []))
  }

  async function addReferences(assignment: MimicAssignment, files: File[]) {
    setUploadingRef(assignment.id)
    setMessage(null)
    const added: string[] = []
    try {
      for (const file of files) added.push(await actions.uploadFile(await normalizeReferenceImage(file)))
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "That image could not be added." })
    } finally {
      if (added.length) {
        setDraft(d => d ? { ...d, assignments: d.assignments.map(a => a.id === assignment.id ? { ...a, referenceUrls: [...a.referenceUrls, ...added].slice(0, MIMIC_CAPABILITY.subjectMaxImages) } : a) } : d)
        setDirty(true)
      }
      setUploadingRef(null)
    }
  }

  const settings: MimicSettings | null = useMemo(() => selected && draft ? {
    source: { durationMs: selected.source.durationMs, width: selected.source.width, height: selected.source.height, hasAudio: selected.source.hasAudio, url: selected.source.url },
    ...draft,
  } : null, [selected, draft])
  const planned = useMemo(() => settings ? planMimicRequest(settings, { multiSubject: loaded?.multiSubject }) : null, [settings, loaded?.multiSubject])

  async function save(): Promise<MimicTaskView | null> {
    if (!selected || !draft) return null
    const result = await actions.save({ taskId: selected.id, ...draft }).catch((): TaskResult => ({ error: "Could not save. Check your connection and try again." }))
    if (result.error || !result.data) { setMessage({ tone: "error", text: result.error || "Could not save." }); return null }
    put(result.data)
    setDirty(false)
    return result.data
  }

  async function generate() {
    if (!selected || !planned?.ok || busy) return
    setBusy("generate")
    setMessage(null)
    try {
      // What is generated is exactly what is on screen: unsaved changes are saved first.
      if (dirty && !(await save())) return
      const result = await actions.generate({ taskId: selected.id, approvedUnits: planned.plan.units, rightsConfirmed: true }).catch((): TaskResult => ({ error: "We couldn't reach the server. Check whether this take started before trying again." }))
      if (result.data) put(result.data)
      if (result.error) { setMessage({ tone: "error", text: result.error }); return }
      setRights(false)
      setNow(Date.now())
      setMessage({ tone: "ok", text: "Submitted. You can leave this page; the take will be here when it finishes." })
    } finally {
      setBusy(null)
    }
  }

  async function run(work: () => Promise<{ error?: string; data?: unknown }>, done?: (data: unknown) => void, ok?: string) {
    if (busy) return
    setBusy("other")
    setMessage(null)
    try {
      const result = await work().catch((): { error?: string; data?: unknown } => ({ error: "Something went wrong. Try again." }))
      if (result.error) { setMessage({ tone: "error", text: result.error }); return }
      done?.(result.data)
      if (ok) setMessage({ tone: "ok", text: ok })
    } finally {
      setBusy(null)
    }
  }

  if (!loaded) return <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="size-4 animate-spin" aria-hidden />Loading Mimic…</p>
  if (!loaded.available) return <p className="lux-glass rounded-3xl p-6 text-sm text-white/70">Mimic needs a database update (migration 0055) before takes can be saved.</p>

  // Where the creator is: perform, cast, review, result.
  const step = !selected ? 0 : working || selected.status === "completed" || selected.status === "unknown" ? 3 : planned?.ok ? 2 : 1
  const busySource = source.state === "uploading" || source.state === "preparing"
  const summary: (readonly [string, string])[] = planned?.ok && settings ? mimicSummary(settings, planned.plan).map(line => { const at = line.indexOf(": "); return at > 0 ? [line.slice(0, at), capitalise(line.slice(at + 2))] as const : ["Result", line] as const }) : []
  const assignments = draft?.assignments ?? []

  return (
    <div ref={top} className="scroll-mt-20 space-y-6 pb-28 lg:pb-0" data-testid="mimic-studio">
      {/* Where you are in the three steps, plus the result. */}
      <ol className="flex items-center gap-1.5 overflow-x-auto text-[12px] sm:gap-2" aria-label="Steps">
        {["Perform", "Cast", "Review", "Result"].map((name, i) => (
          <li key={name} className="flex items-center gap-2">
            <span aria-current={i === step ? "step" : undefined} className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1.5 sm:gap-2 sm:px-3 ${i < step ? styles.stepDone : i === step ? styles.stepNow : "border-white/10 text-white/45"}`}>
              <span className="grid size-4 place-items-center text-[10px] font-semibold">{i < step ? <Check className="size-3" aria-hidden /> : i + 1}</span>{name}
            </span>
            {i < 3 && <span className="h-px w-2 shrink-0 bg-white/15 sm:w-5" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,1fr)]">
        {/* ───────── Stage ───────── */}
        <section aria-label="Your take" className="min-w-0 space-y-4">
          {!selected ? (
            <div
              className={`lux-glass space-y-4 rounded-[28px] p-4 sm:p-5 ${dropping ? styles.drop : ""}`}
              onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDropping(true) } }}
              onDragLeave={() => setDropping(false)}
              onDrop={e => { e.preventDefault(); setDropping(false); const file = [...e.dataTransfer.files].find(f => f.type.startsWith("video/")); if (file && !busySource) void addSource(file, "uploaded") }}
            >
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80">Step 1</p>
                  <h2 className={`${styles.serif} text-2xl text-white`}>Your <em className="text-gold-100">performance</em></h2>
                </div>
                <p className="hidden text-xs text-white/45 md:block">Or drop a video anywhere here</p>
              </div>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Where the take comes from">
                {([["record", "Record", "With this camera", VideoCamera], ["upload", "Upload", "A file you have", UploadSimple], ["library", "My videos", "Something you made", FilmReel]] as const).map(([id, title, hint, Icon]) => (
                  <button key={id} type="button" role="radio" aria-checked={sourceTab === id} disabled={busySource}
                    onClick={() => id === "library" ? void openLibrary() : setSourceTab(id)} className={`${styles.tile} p-3 text-left sm:p-4`}>
                    <Icon className={`size-[22px] ${sourceTab === id ? "text-gold-200" : "text-white/55"}`} weight={sourceTab === id ? "fill" : "duotone"} aria-hidden />
                    <span className="mt-2 block whitespace-nowrap text-[13px] text-white sm:text-sm">{title}</span>
                    <span className="hidden text-[11px] text-white/45 sm:block">{hint}</span>
                  </button>
                ))}
              </div>

              {sourceTab === "record" && <MimicRecorder disabled={busySource} onUse={file => void addSource(file, "recorded")} onUploadInstead={() => setSourceTab("upload")} />}
              {sourceTab === "upload" && (
                <button type="button" disabled={busySource} onClick={() => fileInput.current?.click()} className={`${styles.monitor} grid aspect-video w-full place-items-center p-6 text-center transition-colors hover:border-gold-300/40`}>
                  <span className="relative z-10">
                    <span className="mx-auto grid size-14 place-items-center rounded-full border border-gold-300/30 bg-gold-300/[0.07]"><Upload className="size-6 text-gold-100" aria-hidden /></span>
                    <span className={`${styles.serif} mt-3 block text-xl text-white`}>Drop your take here</span>
                    <span className="mt-1 block text-sm text-white/55">or click to choose · MP4, MOV or WebM · {MIMIC_CAPABILITY.minClipMs / 1000}–{MAX_MIMIC_SOURCE_MS / 1000} s · under 80 MB</span>
                  </span>
                </button>
              )}
              <input ref={fileInput} type="file" accept={VIDEO_TYPES.join(",")} hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void addSource(file, "uploaded") }} />
              {sourceTab === "library" && (
                library === null ? <p className="flex items-center gap-2 py-10 text-sm text-white/60"><Loader2 className="size-4 animate-spin" aria-hidden />Loading your videos…</p>
                  : library.length === 0 ? <p className={`${styles.monitor} grid aspect-video place-items-center p-6 text-center text-sm text-white/60`}><span className="relative z-10">Nothing in My videos yet. Record or upload a take instead.</span></p>
                    : (
                      <ul className="grid max-h-[52dvh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                        {library.map(item => (
                          <li key={item.id}>
                            <button type="button" disabled={busySource} onClick={() => void prepare(item.url, item.name, "library")} className={`${styles.tile} block w-full text-left`}>
                              <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
                              <span className="block truncate px-2.5 py-2 text-[11px] text-white/80">{item.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
              )}

              {busySource && (
                <div role="status" className="flex items-center gap-3 rounded-2xl border border-gold-300/20 bg-gold-300/[0.05] px-4 py-3 text-sm text-gold-50">
                  <Loader2 className="size-4 animate-spin text-gold-200" aria-hidden />
                  <span className="min-w-0 truncate">{source.state === "uploading" ? `Uploading ${source.name}…` : `Preparing ${source.name} for the model…`}</span>
                </div>
              )}
              {source.state === "failed" && (
                <p role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{source.text}
                  {source.retry && <button type="button" onClick={source.retry} className="rounded-full border border-red-300/40 px-3 py-0.5 text-xs hover:bg-red-500/10">Try again</button>}
                </p>
              )}
              <p className="flex items-start gap-2 text-xs text-white/45"><ShieldCheck className="mt-px size-3.5 shrink-0 text-white/40" aria-hidden />Recording and uploading never generate anything or use your allowance. Your take is sent to an external video model only when you approve it.</p>
            </div>
          ) : (
            <div className="lux-glass space-y-4 rounded-[28px] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={`${styles.serif} truncate text-2xl text-white`}>{selected.title}</h2>
                    <StatusPill status={selected.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/45">
                    <span>{sec(selected.source.durationMs)}</span><span>{selected.source.width}×{selected.source.height}</span>
                    <span>{selected.source.hasAudio ? "With sound" : "No sound"}</span>
                    <span className="capitalize">{selected.source.origin === "library" ? "From My videos" : selected.source.origin}</span>
                    {selected.parentTaskId && <span className="text-gold-200/80">New version</span>}
                  </p>
                </div>
                <button type="button" onClick={() => select(null)} className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/80 hover:bg-white/5"><Plus className="size-3.5" aria-hidden />New take</button>
              </div>

              {selected.resultUrl ? (
                <MimicCompare originalUrl={selected.source.url} resultUrl={selected.resultUrl} />
              ) : (
                <div className={`${styles.monitor} aspect-video`}>
                  <video ref={preview} key={selected.source.url} src={selected.source.url} controls playsInline preload="metadata" className="absolute inset-0 size-full object-contain"
                    onTimeUpdate={e => setPlayhead(e.currentTarget.currentTime * 1000)} />
                  {working && <div className={styles.developing} aria-hidden />}
                  <span className="pointer-events-none absolute left-4 top-3 z-[6] rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-white/85">Original · unchanged</span>
                </div>
              )}

              {editable && draft && (
                <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-3">
                  <p className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/45"><span>Part to transform</span><span className="normal-case tracking-normal">Drag the handles</span></p>
                  <MimicTrimmer src={selected.source.url} durationMs={selected.source.durationMs} startMs={draft.trimStartMs} endMs={draft.trimEndMs}
                    minMs={MIMIC_CAPABILITY.minClipMs} maxMs={MIMIC_CAPABILITY.maxClipMs} playheadMs={playhead}
                    onChange={(start, end) => { change({ trimStartMs: start, trimEndMs: end }); if (preview.current) preview.current.currentTime = start / 1000 }} />
                </div>
              )}

              {working && (
                <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold-300/25 bg-gold-300/[0.06] px-4 py-3 text-sm text-gold-50">
                  <Loader2 className="size-4 animate-spin text-gold-200" aria-hidden />
                  <span className="flex-1">{MIMIC_STATUS_LABELS[selected.status]} on {MIMIC_CAPABILITY.label}. This can take a few minutes; you can leave and come back.</span>
                  {selected.submittedAt && <span className="flex items-center gap-1 tabular-nums text-gold-200/80"><Clock className="size-3.5" aria-hidden />{elapsed(selected.submittedAt, now)}</span>}
                </div>
              )}
              {selected.status === "unknown" && (
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4 text-sm text-amber-100">
                  <p className="flex items-center gap-2"><AlertTriangle className="size-4" aria-hidden />We couldn&apos;t confirm whether this take started, so it won&apos;t be retried automatically.</p>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(() => actions.release({ taskId: selected.id }), data => put(data as MimicTaskView))} className="mt-3 rounded-full border border-amber-200/40 px-3 py-1 text-xs hover:bg-amber-300/10 disabled:opacity-40">Check and release it</button>
                </div>
              )}
              {selected.errorMessage && selected.status !== "completed" && <p role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{selected.errorMessage}</p>}

              {selected.status === "completed" && selected.resultUrl && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(() => actions.saveToVideos({ taskId: selected.id }), undefined, "Saved to My videos as a new clip.")} className={`${styles.goldButton} flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium`}><Check className="size-4" aria-hidden />Save to My videos</button>
                  <a href={selected.resultUrl} download className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/85 hover:bg-white/5"><Download className="size-4" aria-hidden />Download</a>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(() => actions.duplicate({ taskId: selected.id }), data => { put(data as MimicTaskView); select(data as MimicTaskView) })} className="flex items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/85 hover:bg-white/5 disabled:opacity-40"><Pencil className="size-4" aria-hidden />Change and regenerate</button>
                </div>
              )}
              {!working && selected.status !== "unknown" && (
                <button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Delete this take? Its result is deleted too.")) void run(() => actions.remove({ taskId: selected.id }), () => { setTasks(list => list.filter(t => t.id !== selected.id)); select(null) }) }} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-red-200 disabled:opacity-40"><Trash2 className="size-3.5" aria-hidden />Delete this take</button>
              )}
            </div>
          )}
        </section>

        {/* ───────── Cast, direction and call sheet ───────── */}
        <section aria-label="What changes" className="min-w-0 space-y-4 lg:sticky lg:top-20">
          {!selected || !draft ? (
            <div className="lux-glass rounded-[28px] p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80">Then</p>
              <h2 className={`${styles.serif} text-2xl text-white`}>Cast it, <em className="text-gold-100">approve it</em></h2>
              <ol className="mt-4 space-y-3 text-sm text-white/65">
                {[["Who or what changes", "Point at a person or object in your take and give it a reference image."], ["Review the call sheet", "See exactly what changes, what stays, the sound and the cost."], ["Generate", "Your movement and timing stay; the look changes. Your recording is never altered."]].map(([title, body], i) => (
                  <li key={title} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full border border-gold-300/30 text-[11px] text-gold-200">{i + 2}</span><span><span className="block text-white/90">{title}</span>{body}</span></li>
                ))}
              </ol>
            </div>
          ) : (
            <>
              <fieldset disabled={!editable || Boolean(busy)} className="lux-glass min-w-0 space-y-4 rounded-[28px] p-4 sm:p-5 disabled:opacity-75">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80">Step 2</p>
                    <h2 className={`${styles.serif} text-2xl text-white`}>Cast <em className="text-gold-100">&amp; props</em></h2>
                  </div>
                  {!loaded.multiSubject && <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] uppercase tracking-wide text-white/50" title="Changing several people or objects in one take is switched off until it has been verified.">Beta · one change per take</span>}
                </div>

                {assignments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/12 p-5 text-center">
                    <p className="text-sm text-white/75">Who or what should change?</p>
                    <p className="mt-1 text-xs text-white/45">Add a person to recast, or an object to swap. You can also just describe the change below.</p>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {assignments.map((a, index) => (
                      <MimicCastCard key={a.id} assignment={a} index={index} held={!loaded.multiSubject && index > 0} uploading={uploadingRef === a.id}
                        onChange={patch => changeAssignment(a.id, patch)} onRemove={() => change({ assignments: assignments.filter(x => x.id !== a.id) })}
                        onAddImages={files => void addReferences(a, files)} />
                    ))}
                  </ul>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {([["person", "Add person", User], ["object", "Add object", Box]] as const).map(([type, text, Icon]) => (
                    <button key={type} type="button" disabled={assignments.length >= MAX_MIMIC_ASSIGNMENTS} onClick={() => change({ assignments: [...assignments, newAssignment(type)] })}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-gold-400/35 py-2.5 text-sm text-gold-100 transition-colors hover:bg-gold-500/[0.06] disabled:opacity-40">
                      <Plus className="size-4" aria-hidden /><Icon className="size-4" aria-hidden />{text}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 border-t border-white/[0.06] pt-4">
                  <label className="block text-[10px] uppercase tracking-[0.16em] text-white/45">Direction <span className="normal-case tracking-normal text-white/35">(optional)</span>
                    <textarea value={draft.instructions} maxLength={MAX_MIMIC_INSTRUCTION_CHARS} rows={2} placeholder="Anything else to change or keep, in your own words" onChange={e => change({ instructions: e.target.value })}
                      className="mt-1.5 w-full resize-none rounded-xl border border-white/10 bg-black/40 p-3 text-[13px] normal-case tracking-normal text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Sound</p>
                      <div role="radiogroup" aria-label="Sound" className="mt-1.5 flex rounded-full border border-white/10 bg-black/30 p-0.5 text-xs">
                        {([["keep_source", "Keep sound"], ["mute", "Silent"]] as const).map(([value, text]) => (
                          <button key={value} type="button" role="radio" aria-checked={draft.audioPolicy === value} onClick={() => change({ audioPolicy: value })}
                            className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${draft.audioPolicy === value ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}>{text}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Quality</p>
                      <div role="radiogroup" aria-label="Quality" className="mt-1.5 flex rounded-full border border-white/10 bg-black/30 p-0.5 text-xs">
                        {MIMIC_CAPABILITY.resolutions.map(r => (
                          <button key={r} type="button" role="radio" aria-checked={draft.resolution === r} onClick={() => change({ resolution: r })}
                            className={`flex-1 rounded-full px-3 py-1.5 transition-colors ${draft.resolution === r ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}>{r}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-white/40">{selected.source.hasAudio ? "Reference images don't supply a voice, and a new face may not match the lips perfectly." : "This take has no sound, so the result will be silent."}</p>
                </div>
              </fieldset>

              {editable && planned && (
                <div id="mimic-call-sheet" className={`${styles.callSheet} scroll-mt-20 space-y-4 p-4 sm:p-5`} data-testid="mimic-approval">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-gold-300/80">Step 3</p>
                      <h2 className={`${styles.serif} text-2xl text-white`}>Call <em className="text-gold-100">sheet</em></h2>
                    </div>
                    {planned.ok && <span className="text-right"><span className={`${styles.serif} block text-3xl leading-none text-gold-100`}>{planned.plan.units}</span><span className="text-[10px] uppercase tracking-[0.14em] text-white/45">generation{planned.plan.units === 1 ? "" : "s"}</span></span>}
                  </div>
                  {planned.ok ? (
                    <>
                      {/* Built from mimicSummary(settings, planned.plan): the same words the server checks against. */}
                      <dl className="divide-y divide-white/[0.06] text-[13px]">
                        {summary.map(([term, text], i) => (
                          <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-2">
                            <dt className="pt-0.5">{term}</dt>
                            <dd className="text-white/85">
                              {term === "Changes" && planned.plan.manifest.length ? (
                                <span className="flex flex-wrap gap-1.5">
                                  {planned.plan.manifest.map((m, mi) => (
                                    <span key={m.assignmentId} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 py-0.5 pl-1 pr-2.5 text-[12px]">
                                      <span className="size-3 rounded-full" style={{ background: castColour(mi) }} aria-hidden />{m.target} → {m.label}
                                    </span>
                                  ))}
                                </span>
                              ) : text}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  ) : (
                    <div className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.05] p-3 text-amber-100">
                      <p className="flex items-center gap-2 text-sm"><AlertTriangle className="size-4" aria-hidden />Not ready to generate yet</p>
                      <ul className="mt-2 space-y-1.5 text-xs text-amber-100/85">{planned.issues.map((issue, i) => <li key={i} className="flex gap-2"><span aria-hidden>·</span>{issue}</li>)}</ul>
                    </div>
                  )}
                  <label className="flex items-start gap-2.5 text-xs leading-relaxed text-white/65">
                    <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} className="mt-0.5 accent-[#e3cf9f]" />
                    I have the right to use this footage, the people in it and these reference images, and I understand they are sent to an external video model to make the result.
                  </label>
                  {/* On phones the same button also rides in the bar at the bottom of the screen. */}
                  <div className="hidden gap-2 lg:flex">
                    <GenerateButton planned={planned} rights={rights} busy={busy} onGenerate={() => void generate()} />
                    <SaveButton dirty={dirty} busy={busy} onSave={() => { setBusy("save"); void save().then(saved => { if (saved) setMessage({ tone: "ok", text: "Saved." }) }).finally(() => setBusy(null)) }} />
                  </div>
                  <p className="text-[11px] leading-relaxed text-white/40">Counted from your allowance, the same as Create. The result aims to keep your performance and match your references; that can&apos;t be guaranteed.</p>
                </div>
              )}
            </>
          )}
          {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 text-sm ${message.tone === "error" ? "border border-red-400/30 bg-red-500/10 text-red-100" : "border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]"}`}>{message.text}</p>}
        </section>
      </div>

      {/* Phone: the decision stays in reach. */}
      {selected && editable && planned && (
        <div className="fixed inset-x-0 bottom-[76px] z-30 border-t border-white/10 bg-obsidian-950/90 px-4 py-3 backdrop-blur-xl md:bottom-0 lg:hidden">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <button type="button" onClick={() => document.getElementById("mimic-call-sheet")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="min-w-0 flex-1 text-left text-xs text-white/60 underline-offset-2 hover:underline">
              {planned.ok ? (rights ? "Ready when you are." : "Tick the rights box in the call sheet.") : `${planned.issues.length} thing${planned.issues.length === 1 ? "" : "s"} to fix first`}
            </button>
            <GenerateButton planned={planned} rights={rights} busy={busy} onGenerate={() => void generate()} compact />
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <section aria-label="Your Mimic takes" className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className={`${styles.serif} text-xl text-white`}>Your <em className="text-gold-100">takes</em></h2>
            <span className="text-xs text-white/45">{tasks.length} take{tasks.length === 1 ? "" : "s"}</span>
          </div>
          <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
            {tasks.map(task => (
              <li key={task.id} className="w-56 shrink-0 snap-start">
                <button type="button" onClick={() => select(task)} aria-pressed={task.id === selectedId} className={`${styles.tile} block w-full text-left`}>
                  <span className="relative block">
                    <video src={`${task.resultUrl ?? task.source.url}#t=0.1`} muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
                    <span className="absolute left-2 top-2"><StatusPill status={task.status} /></span>
                    {task.resultUrl && <Sparkles className="absolute right-2 top-2 size-4 text-gold-200 drop-shadow" aria-hidden />}
                  </span>
                  <span className="block truncate px-3 pt-2 text-[13px] text-white">{task.title}</span>
                  <span className="block px-3 pb-2.5 text-[11px] text-white/45">{sec(task.trimEndMs - task.trimStartMs)} · {task.assignments.length || "no"} change{task.assignments.length === 1 ? "" : "s"}{task.parentTaskId ? " · new version" : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function GenerateButton({ planned, rights, busy, onGenerate, compact }: { planned: ReturnType<typeof planMimicRequest>; rights: boolean; busy: string | null; onGenerate: () => void; compact?: boolean }) {
  return (
    <button type="button" disabled={!planned.ok || !rights || Boolean(busy)} onClick={onGenerate}
      className={`${styles.goldButton} flex items-center justify-center gap-2 rounded-full font-medium ${compact ? "px-5 py-2.5 text-sm" : "flex-1 px-5 py-3 text-[15px]"}`}>
      {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Film className="size-4" aria-hidden />}
      {busy === "generate" ? "Submitting…" : planned.ok ? `Generate · ${planned.plan.units}` : "Generate"}
    </button>
  )
}

function SaveButton({ dirty, busy, onSave }: { dirty: boolean; busy: string | null; onSave: () => void }) {
  return (
    <button type="button" disabled={!dirty || Boolean(busy)} onClick={onSave} className="rounded-full border border-white/15 px-4 py-3 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40">
      {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
    </button>
  )
}
