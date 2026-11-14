"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Box, Check, Download, Film, ImagePlus, Loader2, Plus, Trash2, Upload, User, Video, X } from "lucide-react"
import {
  createMimicTask, deleteMimicTask, duplicateMimicTask, generateMimic, listMimicTasks, refreshMimic, releaseUnconfirmedMimic, saveMimicTask, saveMimicToVideos,
  type MimicTaskView,
} from "@/core/actions/mimic"
import { getGalleryAssets } from "@/core/actions/gallery"
import {
  MAX_MIMIC_ASSIGNMENTS, MAX_MIMIC_CHANGE_CHARS, MAX_MIMIC_INSTRUCTION_CHARS, MAX_MIMIC_SOURCE_MS, MAX_MIMIC_TARGET_CHARS, MIMIC_CAPABILITY, MIMIC_STATUS_LABELS,
  mimicSummary, planMimicRequest, type MimicAssignment, type MimicAudioPolicy, type MimicResolution, type MimicSettings,
} from "@/core/services/mimic"
import { normalizeReferenceImage } from "@/interface/components/fast-video/normalize-image"
import { uploadReferenceFile } from "@/interface/components/fast-video/upload-reference"
import { MimicRecorder } from "./MimicRecorder"

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

/** Each change keeps one colour, on its card and in the summary, so several stay easy to tell apart. */
const COLOURS = ["#d9c08a", "#8fd1b9", "#9db7ff", "#f0a6a6", "#c9a7f5", "#f2c48d"]
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]
const MAX_UPLOAD_BYTES = 80 * 1024 * 1024
const sec = (ms: number) => Number((ms / 1000).toFixed(1))

type Draft = { trimStartMs: number; trimEndMs: number; assignments: MimicAssignment[]; instructions: string; audioPolicy: MimicAudioPolicy; resolution: MimicResolution }
const draftOf = (task: MimicTaskView): Draft => ({
  trimStartMs: task.trimStartMs, trimEndMs: task.trimEndMs, assignments: task.assignments, instructions: task.instructions, audioPolicy: task.audioPolicy, resolution: task.resolution,
})
const newAssignment = (targetType: MimicAssignment["targetType"]): MimicAssignment => ({ id: crypto.randomUUID(), label: "", targetType, target: "", referenceUrls: [], instructions: "" })

type TaskResult = { data?: MimicTaskView; error?: string }
type SourceState = { state: "idle" } | { state: "uploading" | "preparing"; name: string } | { state: "failed"; text: string; retry?: () => void }

export function MimicStudio({ actions = DEFAULT_MIMIC_ACTIONS }: { actions?: MimicActions }) {
  const [tasks, setTasks] = useState<MimicTaskView[]>([])
  const [loaded, setLoaded] = useState<{ available: boolean; multiSubject: boolean } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [sourceTab, setSourceTab] = useState<"record" | "upload" | "library">("record")
  const [source, setSource] = useState<SourceState>({ state: "idle" })
  const [library, setLibrary] = useState<{ id: string; url: string; name: string }[] | null>(null)
  const [busy, setBusy] = useState<null | "save" | "generate" | "other">(null)
  const [rights, setRights] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const [uploadingRef, setUploadingRef] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const selected = tasks.find(task => task.id === selectedId) ?? null
  const editable = selected?.status === "ready" || selected?.status === "failed"
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
    const timer = window.setInterval(() => {
      for (const taskId of generatingIds.split(",")) {
        void actions.refresh({ taskId }).then(result => { if (result.data) put(result.data) }).catch(() => undefined)
      }
    }, 8000)
    return () => window.clearInterval(timer)
  }, [generatingIds, actions, put])

  function select(task: MimicTaskView | null) {
    setSelectedId(task?.id ?? null)
    setDraft(task ? draftOf(task) : null)
    setDirty(false)
    setRights(false)
    setMessage(null)
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

  async function addReference(assignment: MimicAssignment, file: File) {
    setUploadingRef(assignment.id)
    setMessage(null)
    try {
      const url = await actions.uploadFile(await normalizeReferenceImage(file))
      changeAssignment(assignment.id, { referenceUrls: [...assignment.referenceUrls, url].slice(0, MIMIC_CAPABILITY.subjectMaxImages) })
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "That image could not be added." })
    } finally {
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

  return (
    <div className="space-y-6" data-testid="mimic-studio">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* Source and preview */}
        <section aria-label="Your take" className="lux-glass min-w-0 space-y-4 rounded-3xl p-4 sm:p-5">
          {!selected ? (
            <>
              <h2 className="text-[15px] font-medium text-white">1. Your performance</h2>
              <div role="tablist" aria-label="Where the take comes from" className="grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1 text-sm">
                {([["record", "Record"], ["upload", "Upload"], ["library", "My videos"]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={sourceTab === id} onClick={() => id === "library" ? void openLibrary() : setSourceTab(id)}
                    className={`rounded-lg px-3 py-2 transition-colors ${sourceTab === id ? "bg-gold-200 font-medium text-[#1a160e]" : "text-white/70 hover:text-white"}`}>{label}</button>
                ))}
              </div>
              {sourceTab === "record" && <MimicRecorder disabled={source.state === "uploading" || source.state === "preparing"} onUse={file => void addSource(file, "recorded")} onUploadInstead={() => setSourceTab("upload")} />}
              {sourceTab === "upload" && (
                <div className="rounded-2xl border border-dashed border-white/15 p-6 text-center">
                  <Upload className="mx-auto size-6 text-white/40" aria-hidden />
                  <p className="mt-2 text-sm text-white/70">MP4, MOV or WebM, {MIMIC_CAPABILITY.minClipMs / 1000} to {MAX_MIMIC_SOURCE_MS / 1000} seconds, under 80 MB.</p>
                  <button type="button" disabled={source.state === "uploading" || source.state === "preparing"} onClick={() => fileInput.current?.click()} className="mt-3 rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Choose a video</button>
                  <input ref={fileInput} type="file" accept={VIDEO_TYPES.join(",")} hidden onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void addSource(file, "uploaded") }} />
                </div>
              )}
              {sourceTab === "library" && (
                library === null ? <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="size-4 animate-spin" aria-hidden />Loading your videos…</p>
                  : library.length === 0 ? <p className="rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">No videos in My videos yet. Record or upload a take instead.</p>
                    : (
                      <ul className="grid max-h-[50dvh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                        {library.map(item => (
                          <li key={item.id}>
                            <button type="button" disabled={source.state !== "idle" && source.state !== "failed"} onClick={() => void prepare(item.url, item.name, "library")} className="block w-full overflow-hidden rounded-xl border border-white/10 text-left hover:border-gold-300/60 disabled:opacity-40">
                              <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
                              <span className="block truncate px-2 py-1 text-[11px] text-white/80">{item.name}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )
              )}
              {(source.state === "uploading" || source.state === "preparing") && (
                <p role="status" className="flex items-center gap-2 text-sm text-white/70"><Loader2 className="size-4 animate-spin" aria-hidden />{source.state === "uploading" ? `Uploading ${source.name}…` : `Preparing ${source.name}…`}</p>
              )}
              {source.state === "failed" && (
                <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-200">{source.text}
                  {source.retry && <button type="button" onClick={source.retry} className="rounded-full border border-red-300/40 px-2.5 py-0.5 text-xs text-red-100 hover:bg-red-500/10">Try again</button>}
                </p>
              )}
              <p className="text-xs text-white/45">Recording or uploading never generates anything and never uses your allowance. Takes are sent to an external video model only when you approve generation.</p>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-medium text-white">{selected.title}</h2>
                  <p className="text-xs text-white/50" data-testid="mimic-status">{MIMIC_STATUS_LABELS[selected.status]} · {sec(selected.source.durationMs)} s take · {selected.source.width}×{selected.source.height}{selected.parentTaskId ? " · new version" : ""}</p>
                </div>
                <button type="button" onClick={() => select(null)} className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 hover:bg-white/5">New take</button>
              </div>
              <div className={`grid gap-3 ${selected.resultUrl ? "sm:grid-cols-2" : ""}`}>
                <figure className="min-w-0">
                  <video key={selected.source.url} src={selected.source.url} controls playsInline preload="metadata" className="aspect-video w-full rounded-2xl border border-white/10 bg-black object-contain" />
                  <figcaption className="mt-1 text-[11px] text-white/50">Original · unchanged</figcaption>
                </figure>
                {selected.resultUrl && (
                  <figure className="min-w-0">
                    <video key={selected.resultUrl} src={selected.resultUrl} controls playsInline preload="metadata" className="aspect-video w-full rounded-2xl border border-gold-300/30 bg-black object-contain" />
                    <figcaption className="mt-1 text-[11px] text-gold-200">Result · a new take</figcaption>
                  </figure>
                )}
              </div>
              {selected.status === "generating" || selected.status === "queued" ? (
                <p role="status" className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/75"><Loader2 className="size-4 animate-spin" aria-hidden />{MIMIC_STATUS_LABELS[selected.status]}. This usually takes a few minutes; you can leave and come back.</p>
              ) : null}
              {selected.status === "unknown" && (
                <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3 text-sm text-amber-100">
                  <p>We couldn&apos;t confirm whether this take started, so it won&apos;t be retried automatically.</p>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(() => actions.release({ taskId: selected.id }), data => put(data as MimicTaskView))} className="mt-2 rounded-full border border-amber-200/40 px-3 py-1 text-xs hover:bg-amber-300/10 disabled:opacity-40">Check and release it</button>
                </div>
              )}
              {selected.status === "completed" && selected.resultUrl && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(() => actions.saveToVideos({ taskId: selected.id }), undefined, "Saved to My videos as a new clip.")} className="rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-40">Save to My videos</button>
                  <a href={selected.resultUrl} download className="flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5"><Download className="size-4" aria-hidden />Download</a>
                  <button type="button" disabled={Boolean(busy)} onClick={() => void run(() => actions.duplicate({ taskId: selected.id }), data => { put(data as MimicTaskView); select(data as MimicTaskView) })} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40">Change and regenerate</button>
                </div>
              )}
              {selected.errorMessage && selected.status !== "completed" && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{selected.errorMessage}</p>}
              {selected.status !== "generating" && selected.status !== "queued" && selected.status !== "unknown" && (
                <button type="button" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Delete this take? Its result is deleted too.")) void run(() => actions.remove({ taskId: selected.id }), () => { setTasks(list => list.filter(t => t.id !== selected.id)); select(null) }) }} className="flex items-center gap-1.5 text-xs text-red-200/80 hover:underline disabled:opacity-40"><Trash2 className="size-3.5" aria-hidden />Delete this take</button>
              )}
            </>
          )}
        </section>

        {/* What changes, and approval */}
        <section aria-label="What changes" className="lux-glass min-w-0 space-y-4 rounded-3xl p-4 sm:p-5">
          {!selected || !draft ? (
            <div className="text-sm text-white/60">
              <h2 className="text-[15px] font-medium text-white">2. What changes</h2>
              <p className="mt-2">Once you have a take, say who or what in it should change and add reference images. Then review the summary and cost before anything is generated.</p>
            </div>
          ) : (
            <fieldset disabled={!editable || Boolean(busy)} className="min-w-0 space-y-4 disabled:opacity-70">
              <h2 className="text-[15px] font-medium text-white">2. What changes</h2>
              <ul className="space-y-3">
                {draft.assignments.map((a, index) => {
                  const colour = COLOURS[index % COLOURS.length]
                  return (
                    <li key={a.id} className="rounded-2xl border bg-white/[0.02] p-3" style={{ borderColor: `${colour}66` }} data-testid="mimic-assignment">
                      <div className="flex items-center gap-2">
                        <span className="grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-medium text-black" style={{ background: colour }}>{index + 1}</span>
                        <select aria-label="Person or object" value={a.targetType} onChange={e => changeAssignment(a.id, { targetType: e.target.value as MimicAssignment["targetType"] })} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white">
                          <option value="person">Person</option>
                          <option value="object">Object</option>
                        </select>
                        <input aria-label="Name for this change" placeholder={a.targetType === "person" ? "Becomes (e.g. Sam)" : "Becomes (e.g. My product)"} value={a.label} maxLength={60} onChange={e => changeAssignment(a.id, { label: e.target.value })} className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white placeholder:text-white/30" />
                        <button type="button" aria-label="Remove change" title="Removes this change. Nothing is removed from your footage." onClick={() => change({ assignments: draft.assignments.filter(x => x.id !== a.id) })} className="grid size-8 shrink-0 place-items-center rounded-lg text-white/60 hover:bg-white/5"><X size={15} /></button>
                      </div>
                      <label className="mt-2 block text-[11px] text-white/55">Who or what in your take
                        <input placeholder={a.targetType === "person" ? "e.g. the man on the left in the grey hoodie" : "e.g. the bottle on the table"} value={a.target} maxLength={MAX_MIMIC_TARGET_CHARS} onChange={e => changeAssignment(a.id, { target: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white placeholder:text-white/30" />
                      </label>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {a.referenceUrls.map(url => (
                          <span key={url} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="Reference" className="size-14 rounded-lg object-cover" />
                            <button type="button" aria-label="Remove reference image" onClick={() => changeAssignment(a.id, { referenceUrls: a.referenceUrls.filter(x => x !== url) })} className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-black text-white ring-1 ring-white/30"><X size={11} /></button>
                          </span>
                        ))}
                        {a.referenceUrls.length < MIMIC_CAPABILITY.subjectMaxImages && (
                          <label className="grid size-14 cursor-pointer place-items-center rounded-lg border border-dashed border-gold-400/35 text-gold-100 hover:bg-gold-500/[0.06]">
                            {uploadingRef === a.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
                            <span className="sr-only">Add reference image</span>
                            <input type="file" accept="image/*,.heic,.heif" hidden disabled={uploadingRef !== null} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void addReference(a, file) }} />
                          </label>
                        )}
                        <span className="text-[11px] text-white/45">{a.referenceUrls.length ? `${a.referenceUrls.length} of ${MIMIC_CAPABILITY.subjectMaxImages} reference images` : "Add 1 to 4 reference images"}</span>
                      </div>
                      <input aria-label="Extra direction for this change" placeholder="Optional: extra direction for this change" value={a.instructions} maxLength={MAX_MIMIC_CHANGE_CHARS} onChange={e => changeAssignment(a.id, { instructions: e.target.value })} className="mt-2 h-8 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white placeholder:text-white/30" />
                    </li>
                  )
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={draft.assignments.length >= MAX_MIMIC_ASSIGNMENTS} onClick={() => change({ assignments: [...draft.assignments, newAssignment("person")] })} className="flex items-center gap-1.5 rounded-xl border border-dashed border-gold-400/35 px-3 py-2 text-sm text-gold-100 hover:bg-gold-500/[0.06] disabled:opacity-40"><Plus className="size-4" aria-hidden /><User className="size-4" aria-hidden />Add person</button>
                <button type="button" disabled={draft.assignments.length >= MAX_MIMIC_ASSIGNMENTS} onClick={() => change({ assignments: [...draft.assignments, newAssignment("object")] })} className="flex items-center gap-1.5 rounded-xl border border-dashed border-gold-400/35 px-3 py-2 text-sm text-gold-100 hover:bg-gold-500/[0.06] disabled:opacity-40"><Plus className="size-4" aria-hidden /><Box className="size-4" aria-hidden />Add object</button>
              </div>
              {!loaded.multiSubject && <p className="text-xs text-white/45">This beta changes one person or object per take. You can add more and they stay saved, but a take with several can&apos;t be generated yet.</p>}

              <label className="block text-xs text-white/60">Instructions (optional)
                <textarea value={draft.instructions} maxLength={MAX_MIMIC_INSTRUCTION_CHARS} rows={2} placeholder="Anything else to change or keep, in your own words" onChange={e => change({ instructions: e.target.value })} className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 p-2 text-sm text-white placeholder:text-white/30" />
              </label>

              <div role="radiogroup" aria-label="Sound" className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-sm">
                <p className="text-xs uppercase tracking-[0.12em] text-white/50">Sound</p>
                <div className="mt-2 flex flex-wrap gap-3 text-white/80">
                  <label className="flex items-center gap-2"><input type="radio" name="mimic-audio" checked={draft.audioPolicy === "keep_source"} onChange={() => change({ audioPolicy: "keep_source" })} />Keep my take&apos;s sound</label>
                  <label className="flex items-center gap-2"><input type="radio" name="mimic-audio" checked={draft.audioPolicy === "mute"} onChange={() => change({ audioPolicy: "mute" })} />Silent</label>
                </div>
                <p className="mt-1 text-[11px] text-white/45">{selected.source.hasAudio ? "Reference images don't supply a voice, and a new face may not match the lips perfectly." : "This take has no sound."}</p>
              </div>

              <details className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-sm">
                <summary className="cursor-pointer text-white/80">Advanced</summary>
                <div className="mt-3 space-y-3 text-xs text-white/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Use from</span>
                    <input type="number" aria-label="Start in seconds" min={0} step={0.1} value={sec(draft.trimStartMs)} onChange={e => change({ trimStartMs: Math.max(0, Math.round(Number(e.target.value) * 1000) || 0) })} className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 tabular-nums text-white" />
                    <span>to</span>
                    <input type="number" aria-label="End in seconds" min={0} step={0.1} value={sec(draft.trimEndMs)} onChange={e => change({ trimEndMs: Math.min(selected.source.durationMs, Math.max(0, Math.round(Number(e.target.value) * 1000) || 0)) })} className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 tabular-nums text-white" />
                    <span>s of {sec(selected.source.durationMs)} s · {MIMIC_CAPABILITY.label} takes {MIMIC_CAPABILITY.minClipMs / 1000} to {MIMIC_CAPABILITY.maxClipMs / 1000} s</span>
                  </div>
                  <label className="flex items-center gap-2">Quality
                    <select value={draft.resolution} onChange={e => change({ resolution: e.target.value as MimicResolution })} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-white">
                      {MIMIC_CAPABILITY.resolutions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                </div>
              </details>
            </fieldset>
          )}

          {selected && draft && settings && planned && editable && (
            <div className="space-y-3 border-t border-white/[0.06] pt-4" data-testid="mimic-approval">
              <h2 className="text-[15px] font-medium text-white">3. Review and generate</h2>
              {planned.ok ? (
                <ul className="space-y-1 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-[13px] text-white/80">
                  {mimicSummary(settings, planned.plan).map((line, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-[#8fd1b9]" aria-hidden />{line}</li>)}
                </ul>
              ) : (
                <div className="rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3 text-amber-100">
                  <p className="text-sm font-medium">Not ready to generate.</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-100/90">{planned.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
                </div>
              )}
              <label className="flex items-start gap-2 text-xs text-white/65">
                <input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} className="mt-0.5" />
                I have the right to use this footage, the people in it and these reference images, and I understand they are sent to an external video model to make the result.
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!planned.ok || !rights || Boolean(busy)} onClick={() => void generate()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40">
                  {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Film className="size-4" aria-hidden />}
                  {busy === "generate" ? "Submitting…" : planned.ok ? `Generate · ${planned.plan.units} generation${planned.plan.units === 1 ? "" : "s"}` : "Generate"}
                </button>
                <button type="button" disabled={!dirty || Boolean(busy)} onClick={() => { setBusy("save"); void save().then(saved => { if (saved) setMessage({ tone: "ok", text: "Saved." }) }).finally(() => setBusy(null)) }} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 disabled:opacity-40">{busy === "save" ? "Saving…" : "Save changes"}</button>
              </div>
              <p className="text-[11px] text-white/45">Cost is counted in generations from your allowance, the same as Create. The result aims to keep your performance and match your references; it can&apos;t be guaranteed.</p>
            </div>
          )}
          {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${message.tone === "error" ? "border border-red-400/30 bg-red-500/10 text-red-100" : "border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]"}`}>{message.text}</p>}
        </section>
      </div>

      {tasks.length > 0 && (
        <section aria-label="Your Mimic takes" className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-white/50">Your takes</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {tasks.map(task => (
              <li key={task.id}>
                <button type="button" onClick={() => select(task)} aria-pressed={task.id === selectedId} className={`block w-full overflow-hidden rounded-2xl border text-left transition-colors ${task.id === selectedId ? "border-gold-300" : "border-white/10 hover:border-white/30"}`}>
                  <span className="relative block">
                    <video src={`${task.resultUrl ?? task.source.url}#t=0.1`} muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
                    {task.status === "generating" || task.status === "queued" ? <Loader2 className="absolute right-2 top-2 size-4 animate-spin text-white" aria-hidden /> : task.resultUrl ? <Video className="absolute right-2 top-2 size-4 text-gold-200" aria-hidden /> : null}
                  </span>
                  <span className="block truncate px-2 pt-1.5 text-xs text-white">{task.title}</span>
                  <span className="block px-2 pb-2 text-[11px] text-white/50">{MIMIC_STATUS_LABELS[task.status]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
