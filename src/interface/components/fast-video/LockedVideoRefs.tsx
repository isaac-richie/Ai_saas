"use client"

import { useMemo, useRef, useState } from "react"
import { Check, Film, Loader2, Play, Search, Upload, X } from "lucide-react"
import type { ProductionAsset } from "@/core/validation/production-assets"
import { ENDPOINT_CAPABILITIES, endpointKeyFor } from "@/core/services/long-form-locks"
import {
  MAX_VIDEO_GUIDANCE_CHARS, VIDEO_PURPOSES, VIDEO_PURPOSE_LABELS, trimRangeIssue, type VideoPurpose, type VideoRefBinding,
} from "@/core/services/long-form-video-refs"
import { addFilmReferenceVideo, saveVideoRefScope } from "@/core/actions/long-form-video-refs"
import type { FilmLockView, ShotLockStatus } from "@/core/actions/long-form-locks"
import { uploadReferenceFile } from "./upload-reference"

/** The server calls the Videos section makes; the dev preview passes stand-ins. */
export type VideoRefActions = {
  uploadFile: (file: File) => Promise<string>
  addVideo: typeof addFilmReferenceVideo
  save: typeof saveVideoRefScope
}
export const DEFAULT_VIDEO_ACTIONS: VideoRefActions = { uploadFile: uploadReferenceFile, addVideo: addFilmReferenceVideo, save: saveVideoRefScope }

/** A row in the editor: a saved reference (its clip is pinned), or a new pick not yet saved. */
export type VideoRow = {
  key: string
  /** The saved binding's id; absent for a new pick. */
  id?: string
  assetId: string
  name: string
  /** The library video, for preview and range selection. */
  sourceUrl: string
  /** Null until the browser has read a new video's length. */
  durationMs: number | null
  startMs: number
  /** Null = to the end of the video. */
  endMs: number | null
  /** The range as saved, so a changed range is shown as needing a new cut. */
  savedRange?: { startMs: number; endMs: number }
  purpose: VideoPurpose
  guidanceText: string
}

export const toVideoRow = (b: VideoRefBinding): VideoRow => ({
  key: b.id ?? `${b.sourceUrl}|${b.trimStartMs}-${b.trimEndMs}`, id: b.id, assetId: b.assetId, name: b.assetName, sourceUrl: b.sourceUrl,
  durationMs: b.sourceDurationMs, startMs: b.trimStartMs, endMs: b.trimEndMs, savedRange: { startMs: b.trimStartMs, endMs: b.trimEndMs },
  purpose: b.purpose, guidanceText: b.guidanceText,
})

/** What the save action needs for each row. */
export const videoRowInput = (r: VideoRow) => ({
  id: r.id, assetId: r.assetId, trimStartMs: Math.round(r.startMs), trimEndMs: r.endMs === null ? null : Math.round(r.endMs),
  purpose: r.purpose, guidanceText: r.guidanceText.trim(),
})

/** Distinct clips in a set of rows: same video and same range count once. */
export const videoCount = (rows: VideoRow[]) => new Set(rows.map(r => `${r.sourceUrl}|${r.startMs}-${r.endMs ?? "end"}`)).size

const sec = (ms: number) => Number((ms / 1000).toFixed(1))
const modelName = (model: string) => model.includes("seedance") ? "Seedance 2.5" : model.includes("kling") ? "Kling 3.0 Pro" : model
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"]
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** What the shot's model accepts as reference videos, in plain words. Read from the capability registry. */
export function videoLimitText(model: string | undefined): string {
  if (!model) return ""
  const key = endpointKeyFor(model)
  const cap = key ? ENDPOINT_CAPABILITIES[key] : null
  if (!cap?.videos) return `${cap?.label ?? modelName(model)} can't take reference videos. Choose Seedance 2.5 for this shot to use them.`
  const v = cap.videos
  return `${cap.label}: up to ${v.max} reference videos, ${sec(v.minMs)} to ${sec(v.maxMs)} s each, ${sec(v.totalMs)} s in total, with up to ${cap.references.kind === "images" ? cap.references.max : 0} images; not beside a locked start or end frame.`
}

function rowIssue(r: VideoRow, maxClipSeconds: number): string | null {
  if (r.durationMs === null) return null
  const end = r.endMs ?? r.durationMs
  const issue = trimRangeIssue(r.startMs, end, r.durationMs, r.name)
  if (issue) return issue.replace(`${r.name}: `, "")
  return end - r.startMs > maxClipSeconds * 1000 ? `Select ${maxClipSeconds} s or less.` : null
}

/** True when every row has a usable range, so the section can be saved. */
export const videoRowsValid = (rows: VideoRow[], maxClipSeconds: number) => rows.every(r => r.durationMs !== null && !rowIssue(r, maxClipSeconds))

/** The Videos section of the Locked media editor, between Images and Audio. */
export function VideoReferences({ productionId, view, scope, rows, sceneRows, setRows, status, dirty, saving, actions = DEFAULT_VIDEO_ACTIONS, onLibraryChanged }: {
  productionId: string
  view: FilmLockView
  scope: "shot" | "scene"
  rows: VideoRow[]
  /** The scene's references, shown alongside when editing one shot. */
  sceneRows: VideoRow[]
  setRows: (update: (rows: VideoRow[]) => VideoRow[]) => void
  status?: ShotLockStatus
  /** Unsaved changes anywhere in the editor: saved statuses no longer describe what is on screen. */
  dirty: boolean
  saving: boolean
  actions?: VideoRefActions
  onLibraryChanged: () => Promise<void>
}) {
  const video = view.video
  const [picking, setPicking] = useState(false)
  const [permitted, setPermitted] = useState(false)
  const [upload, setUpload] = useState<{ state: "idle" | "uploading" | "failed"; text?: string; file?: File }>({ state: "idle" })
  /** Videos added in this session, before the reloaded library lists them. */
  const [added, setAdded] = useState<ProductionAsset[]>([])
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const input = useRef<HTMLInputElement>(null)
  const library = useMemo(() => [...video.library, ...added.filter(a => !video.library.some(l => l.id === a.id))], [video.library, added])
  const full = rows.length >= video.limitPerScope

  const addRows = (assets: ProductionAsset[], durations: Record<string, number> = {}) => setRows(list => {
    const next = [...list]
    for (const asset of assets) {
      if (next.length >= video.limitPerScope) break
      const durationMs = durations[asset.id] ?? null
      next.push({
        key: `new:${asset.id}:${crypto.randomUUID()}`, assetId: asset.id, name: asset.name, sourceUrl: asset.url, durationMs, startMs: 0,
        // A long video starts with the first stretch selected; the creator moves the range from there.
        endMs: durationMs !== null && durationMs > video.maxClipSeconds * 1000 ? video.maxClipSeconds * 1000 : null,
        purpose: "camera_movement", guidanceText: "",
      })
    }
    return next
  })
  const patch = (key: string, change: Partial<VideoRow>) => setRows(list => list.map(r => r.key === key ? { ...r, ...change } : r))

  async function send(file: File) {
    if (!VIDEO_TYPES.includes(file.type)) { setUpload({ state: "failed", text: `${file.name} isn't an MP4, MOV or WebM video.` }); return }
    if (!file.size || file.size > MAX_UPLOAD_BYTES) { setUpload({ state: "failed", text: `${file.name} is ${(file.size / 1024 / 1024).toFixed(0)} MB. Reference videos must be under 25 MB; trim or export it smaller.` }); return }
    setUpload({ state: "uploading", text: `Uploading ${file.name}…`, file })
    try {
      const url = await actions.uploadFile(file)
      setUpload({ state: "uploading", text: `Processing ${file.name}…`, file })
      const result = await actions.addVideo({ productionId, url, name: file.name.slice(0, 160), permissionConfirmed: true })
      if (result.error || !result.data) throw new Error(result.error || "The video could not be added.")
      const { asset, durationMs } = result.data
      setAdded(list => [...list, asset])
      addRows([asset], { [asset.id]: durationMs })
      setUpload({ state: "idle" })
      await onLibraryChanged()
    } catch (cause) {
      setUpload({ state: "failed", text: cause instanceof Error ? cause.message : "The upload did not finish.", file })
    } finally {
      if (input.current) input.current.value = ""
    }
  }

  const rangeChanged = (r: VideoRow) => Boolean(r.savedRange && (r.savedRange.startMs !== r.startMs || r.savedRange.endMs !== (r.endMs ?? r.durationMs)))
  const stateOf = (r: VideoRow): { text: string; tone: "muted" | "ok" | "warn" } => {
    if (missing.has(r.key)) return { text: "Missing file", tone: "warn" }
    if (saving && (!r.id || rangeChanged(r))) return { text: "Processing…", tone: "muted" }
    if (!r.id) return { text: "Not saved yet", tone: "muted" }
    if (rangeChanged(r)) return { text: "Range changed · re-cut on save", tone: "muted" }
    if (dirty || scope === "scene" || !status || status.status === "none") return { text: "Ready", tone: "ok" }
    if (status.status === "mapped") return { text: `Mapped · ${modelName(status.model)}`, tone: "ok" }
    const blocked = status.issues.some(issue => /video/i.test(issue))
    return blocked ? { text: `Incompatible with ${modelName(status.model)}`, tone: "warn" } : { text: "Ready", tone: "ok" }
  }

  return (
    <section aria-label="Video references" className="space-y-2 border-t border-white/[0.06] pt-4" data-testid="video-references">
      <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white/50"><Film className="size-3.5" aria-hidden /> Video references</h3>
      <p className="text-xs leading-relaxed text-white/55">Use a video to guide movement, camera work, composition or style. Your reference clip is not automatically included in the finished film. Results may vary.</p>
      <p className="text-xs leading-relaxed text-white/45">Reference-video audio is not used or exported in this version. Add approved audio separately in Audio.</p>

      {!video.available ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-center text-sm text-white/50">Video references need a database update (migration 0054) before they can be saved.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-white/55">
            <span>{rows.length} video reference{rows.length === 1 ? "" : "s"}</span>
            <span>Limit {video.limitPerScope} per {scope === "shot" ? "shot" : "scene"}, up to {video.maxClipSeconds} s each (app limits)</span>
          </div>
          {status?.model && <p className="text-xs text-white/45" data-testid="video-model-limits">{videoLimitText(status.model)}</p>}

          {scope === "shot" && sceneRows.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs">
              <span className="text-white/70">From scene · {videoCount(sceneRows)} video reference{videoCount(sceneRows) === 1 ? "" : "s"} sent with every shot</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sceneRows.map(r => (
                  <span key={r.key} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[11px] text-white/75">
                    <Film className="size-3" aria-hidden />{r.name} · {sec(r.startMs)}–{sec(r.endMs ?? r.durationMs ?? 0)} s · {VIDEO_PURPOSE_LABELS[r.purpose]}
                    {rows.some(x => x.sourceUrl === r.sourceUrl && x.startMs === r.startMs && (x.endMs ?? x.durationMs) === (r.endMs ?? r.durationMs)) ? " · also on this shot, sent once" : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-white/50">No video references {scope === "shot" ? "on this shot" : "for the whole scene"} yet.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map(r => {
                const state = stateOf(r)
                const issue = rowIssue(r, video.maxClipSeconds)
                const end = r.endMs ?? r.durationMs
                return (
                  <li key={r.key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5" data-testid="video-reference-row">
                    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <div className="relative">
                        <video
                          src={`${r.sourceUrl}#t=${sec(r.startMs)}`} muted playsInline controls preload="metadata" aria-label={`Preview ${r.name}`}
                          className="aspect-video w-full rounded-lg bg-black object-cover"
                          onLoadedMetadata={e => { const d = e.currentTarget.duration; if (r.durationMs === null && Number.isFinite(d) && d > 0) patch(r.key, { durationMs: Math.floor(d * 1000), endMs: d > video.maxClipSeconds ? video.maxClipSeconds * 1000 : null }) }}
                          onError={() => setMissing(s => new Set(s).add(r.key))}
                        />
                        <Play className="pointer-events-none absolute left-1.5 top-1.5 size-3.5 text-white/80 drop-shadow" aria-hidden />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] text-white">{r.name}</p>
                            <p className="text-[11px] text-white/45">
                              {r.durationMs === null ? "Reading length…" : `Source ${sec(r.durationMs)} s · selected ${sec((end ?? 0) - r.startMs)} s`} · {scope === "shot" ? "This shot" : "Entire scene"}
                            </p>
                          </div>
                          <button type="button" onClick={() => setRows(list => list.filter(x => x.key !== r.key))} className="shrink-0 rounded-lg px-2 py-1 text-xs text-red-200/80 hover:bg-red-500/10">Remove</button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                          <label className="flex items-center gap-1">From
                            <input type="number" aria-label="Range start in seconds" min={0} step={0.1} value={sec(r.startMs)} disabled={r.durationMs === null}
                              onChange={e => patch(r.key, { startMs: Math.max(0, Math.round(Number(e.target.value) * 1000) || 0) })}
                              className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 text-xs tabular-nums" /> s
                          </label>
                          <label className="flex items-center gap-1">to
                            <input type="number" aria-label="Range end in seconds" min={0} step={0.1} value={end === null ? "" : sec(end)} disabled={r.durationMs === null}
                              onChange={e => { const v = Math.round(Number(e.target.value) * 1000); patch(r.key, { endMs: !e.target.value || (r.durationMs !== null && v >= r.durationMs) ? null : Math.max(0, v || 0) }) }}
                              className="h-8 w-16 rounded-lg border border-white/10 bg-black/40 px-2 text-xs tabular-nums" /> s
                          </label>
                          <span className={state.tone === "ok" ? "text-[#8fd1b9]" : state.tone === "warn" ? "text-amber-200" : "text-white/45"} data-testid="video-reference-state">{state.text}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[11rem_minmax(0,1fr)]">
                      <select aria-label="What this video guides" value={r.purpose} onChange={e => patch(r.key, { purpose: e.target.value as VideoPurpose })} className="h-8 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs">
                        {VIDEO_PURPOSES.map(p => <option key={p} value={p}>{VIDEO_PURPOSE_LABELS[p]}</option>)}
                      </select>
                      <input aria-label="Guidance" placeholder="Optional: e.g. use the slow push-in and framing only" value={r.guidanceText} maxLength={MAX_VIDEO_GUIDANCE_CHARS}
                        onChange={e => patch(r.key, { guidanceText: e.target.value })} className="h-8 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs placeholder:text-white/30" />
                    </div>
                    {issue && <p role="alert" className="mt-1.5 text-[11px] text-amber-200">{issue}</p>}
                    {missing.has(r.key) && <p role="alert" className="mt-1.5 text-[11px] text-amber-200">This video can&apos;t be played from the film&apos;s library. Remove the reference and add the video again.</p>}
                  </li>
                )
              })}
            </ul>
          )}

          <label className="flex items-start gap-2 text-xs text-white/60">
            <input type="checkbox" checked={permitted} onChange={e => setPermitted(e.target.checked)} className="mt-0.5" />
            I have permission to use the videos I upload as reference material.
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={!permitted || full || upload.state === "uploading"} onClick={() => input.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/35 py-2.5 text-sm text-gold-100 hover:bg-gold-500/[0.06] disabled:opacity-40">
              {upload.state === "uploading" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}Upload reference video
            </button>
            <button type="button" disabled={full || library.length === 0} onClick={() => setPicking(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/35 py-2.5 text-sm text-gold-100 hover:bg-gold-500/[0.06] disabled:opacity-40">
              + Add videos from this film&apos;s library
            </button>
          </div>
          <input ref={input} type="file" accept={VIDEO_TYPES.join(",")} hidden onChange={e => { const file = e.target.files?.[0]; if (file) void send(file) }} />
          {upload.state === "uploading" && <p role="status" className="text-xs text-white/60">{upload.text}</p>}
          {upload.state === "failed" && (
            <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-200">
              {upload.text}
              {upload.file && <button type="button" onClick={() => void send(upload.file!)} className="rounded-full border border-red-300/40 px-2 py-0.5 text-red-100 hover:bg-red-500/10">Try again</button>}
            </p>
          )}
          <p className="text-xs text-white/45">MP4, MOV or WebM up to 25 MB. Uploads are kept in this film&apos;s library, so you can reuse them on other shots.</p>
        </>
      )}

      {picking && (
        <VideoPicker library={library} onClose={() => setPicking(false)} onAdd={(assets) => { addRows(assets); setPicking(false) }} />
      )}
    </section>
  )
}

/** Multi-select from the film's library videos. */
function VideoPicker({ library, onClose, onAdd }: { library: ProductionAsset[]; onClose: () => void; onAdd: (assets: ProductionAsset[]) => void }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? library.filter(a => `${a.name} ${a.label ?? ""}`.toLowerCase().includes(q)) : library
  }, [library, query])
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-obsidian-900">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] p-4">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search videos by name or tag" aria-label="Search the library videos" className="h-10 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-sm placeholder:text-white/35" />
        </label>
        <button type="button" onClick={onClose} aria-label="Close picker" className="grid size-10 place-items-center rounded-full text-white/60 hover:bg-white/5"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {shown.length === 0 ? <p className="py-8 text-center text-sm text-white/50">No videos match “{query}”.</p> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shown.map(asset => {
              const on = selected.has(asset.id)
              return (
                <li key={asset.id}>
                  <button type="button" aria-pressed={on} aria-label={`${asset.label ?? ""} ${asset.name}`.trim()} onClick={() => setSelected(s => { const n = new Set(s); if (n.has(asset.id)) n.delete(asset.id); else n.add(asset.id); return n })}
                    className={`relative block w-full overflow-hidden rounded-xl border text-left transition-colors ${on ? "border-gold-300" : "border-white/10 hover:border-white/30"}`}>
                    <video src={`${asset.url}#t=0.1`} muted playsInline preload="metadata" className="aspect-video w-full bg-black object-cover" />
                    {on && <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-gold-200 text-[#1a160e]"><Check size={12} strokeWidth={3} /></span>}
                    <span className="block truncate px-2 py-1 text-[11px] text-white/80">{asset.label} · {asset.name}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 border-t border-white/[0.06] p-4">
        <span className="text-sm text-white/70">{selected.size} selected</span>
        <button type="button" disabled={!selected.size} onClick={() => onAdd(library.filter(a => selected.has(a.id)))} className="ml-auto rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 px-5 py-2.5 text-sm font-medium text-black disabled:opacity-40">
          Add {selected.size || ""} video{selected.size === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  )
}
