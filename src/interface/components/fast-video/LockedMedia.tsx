"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { AudioLines, Check, ImageIcon, Lock, Search, X } from "lucide-react"
import type { ProductionAsset } from "@/core/validation/production-assets"
import { LOCK_ROLES, LOCK_ROLE_LABELS, type LockBinding, type LockRole } from "@/core/services/long-form-locks"
import { getFilmLocks, preflightFilmLocks, saveLockScope, type FilmLockView, type ShotLockStatus } from "@/core/actions/long-form-locks"
import { AudioLibraryPanel, AudioPlacements, DEFAULT_AUDIO_ACTIONS, type AudioActions } from "./LockedAudio"

const noSubscribe = () => () => {}
const useIsClient = () => useSyncExternalStore(noSubscribe, () => true, () => false)

/** A row in the editor: a saved (pinned) binding, or a new pick from the library not yet saved. */
type Row = { key: string; assetId: string; assetUrl?: string; name: string; preview: string; alias?: string; role: LockRole; entityLabel: string; viewLabel: string }

const DEFAULT_ROLE: Record<ProductionAsset["role"], LockRole> = { character: "character", wardrobe: "wardrobe", location: "location", product: "prop", lighting: "location" }
const INITIAL_ROWS = 4

const toRow = (b: LockBinding, library: ProductionAsset[]): Row => ({
  key: `${b.assetUrl}|${b.role}|${b.entityLabel}`, assetId: b.assetId, assetUrl: b.assetUrl, name: b.assetName, preview: b.assetUrl,
  alias: library.find(a => a.id === b.assetId)?.label, role: b.role, entityLabel: b.entityLabel, viewLabel: b.viewLabel,
})
/** Distinct images in a set of rows: pinned versions by url, new picks by asset id. */
const imageCount = (rows: Row[]) => new Set(rows.map(r => r.assetUrl ?? `asset:${r.assetId}`)).size

/** A film's locks and per-shot checks, loaded for the Long Form cards; `reload` after any save. */
export function useFilmLocks(productionId: string | null, active: boolean) {
  const [state, setState] = useState<{ view: FilmLockView | null; statuses: Record<number, ShotLockStatus>; error: string | null }>({ view: null, statuses: {}, error: null })
  const reload = useCallback(async () => {
    if (!productionId) return
    const [locks, checks] = await Promise.all([
      getFilmLocks(productionId).catch(() => ({ error: "Could not load locked images." })),
      preflightFilmLocks(productionId).catch(() => ({ data: [] as ShotLockStatus[] })),
    ])
    setState({
      view: "data" in locks && locks.data ? locks.data : null,
      statuses: Object.fromEntries(("data" in checks && checks.data ? checks.data : []).map(item => [item.shotNumber, item])),
      error: "error" in locks && locks.error ? locks.error : null,
    })
  }, [productionId])
  useEffect(() => {
    if (!active || !productionId) return
    let cancelled = false
    void Promise.all([getFilmLocks(productionId), preflightFilmLocks(productionId)]).then(([locks, checks]) => {
      if (cancelled) return
      setState({
        view: locks.data ?? null,
        statuses: Object.fromEntries((checks.data ?? []).map(item => [item.shotNumber, item])),
        error: locks.error ?? null,
      })
    }).catch(() => { if (!cancelled) setState(s => ({ ...s, error: "Could not load locked images." })) })
    return () => { cancelled = true }
  }, [productionId, active])
  return { ...state, reload }
}

/** The film's audio library on its own (from the reference uploader): upload, create, preview. */
export function FilmAudioDialog({ productionId, view, initialTab, onChanged, onClose, audioActions = DEFAULT_AUDIO_ACTIONS }: {
  productionId: string; view: FilmLockView; initialTab: "library" | "upload" | "ai"; onChanged: () => Promise<void>; onClose: () => void; audioActions?: AudioActions
}) {
  const client = useIsClient()
  if (!client) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-label="Film audio" onClick={e => e.stopPropagation()} className="relative h-[85dvh] w-full max-w-xl overflow-hidden rounded-t-3xl border border-white/10 bg-obsidian-900 text-white sm:h-[80dvh] sm:rounded-3xl">
        <AudioLibraryPanel productionId={productionId} view={view} actions={audioActions} initialTab={initialTab} onChanged={onChanged} onClose={onClose} />
      </div>
    </div>,
    document.body,
  )
}

/** The summary row on a Long Form shot card, below Editing notes. */
export function LockedMediaRow({ scene, shot, status, audio, onEdit, disabled }: {
  scene: LockBinding[]
  shot: LockBinding[]
  status?: ShotLockStatus
  /** Audio placements that apply to this shot (its own plus the scene's) and whether any needs attention. */
  audio?: { count: number; needsAttention: boolean }
  onEdit: () => void
  disabled?: boolean
}) {
  const all = [...scene, ...shot]
  const required = status?.requiredImageCount ?? new Set(all.map(b => `${b.assetUrl}#${b.sha256}`)).size
  const audioCount = audio?.count ?? 0
  const thumbs = [...new Map(all.map(b => [b.assetUrl, b])).values()].slice(0, 4)
  const counts = [required ? `${required} image${required === 1 ? "" : "s"}` : "", audioCount ? `${audioCount} audio` : ""].filter(Boolean).join(" · ")
  return (
    <div className="mt-3 rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2 text-xs" data-testid="locked-media-row">
      <div className="flex items-center gap-2">
        <Lock className="size-3.5 shrink-0 text-gold-300/80" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-white/80">
          Locked media <span className={counts ? "tabular-nums text-white" : "text-white/45"}>· {counts || "None"}</span>
        </span>
        <button type="button" disabled={disabled} onClick={onEdit} className="shrink-0 rounded-full border border-white/15 px-2.5 py-0.5 text-[11px] text-white/80 transition-colors hover:border-gold-300/50 hover:text-gold-50 disabled:opacity-40">
          {counts ? "Edit" : "Add"}
        </button>
      </div>
      {counts ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5">
          {required ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                {thumbs.map(b => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={b.assetUrl} src={b.assetUrl} alt="" className="size-5 rounded-full object-cover ring-1 ring-black" />
                ))}
              </span>
              {required > thumbs.length ? <span className="text-white/45">+{required - thumbs.length}</span> : null}
              <StatusChip status={status} />
            </span>
          ) : null}
          {audioCount ? (
            <span className={`flex items-center gap-1 ${audio?.needsAttention ? "text-amber-200" : "text-[#8fd1b9]"}`}>
              <AudioLines className="size-3" aria-hidden />{audio?.needsAttention ? "Not ready to export" : "Audio ready for export"}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Audio placements that apply to a shot, and whether any needs a decision or timing fix. */
export function shotAudioSummary(view: FilmLockView | null, shotNumber: number) {
  if (!view?.audio.enabled) return undefined
  const applies = view.audio.bindings.filter(b => b.scopeType === "scene" || b.shotNumber === shotNumber)
  const ids = new Set(applies.map(b => b.id))
  return { count: applies.length, needsAttention: view.audio.issues.some(i => (i.bindingId ? ids.has(i.bindingId) : false)) }
}

const modelName = (model: string) => model.includes("seedance") ? "Seedance 2.5" : model.includes("kling") ? "Kling 3.0 Pro" : model

function StatusChip({ status }: { status?: ShotLockStatus }) {
  if (!status || status.status === "none") return <span className="truncate text-white/45">Not checked</span>
  if (status.status === "mapped") return <span className="truncate text-[#8fd1b9]">{status.requiredImageCount} mapped · {modelName(status.model)}</span>
  return <span className="truncate text-amber-200" title={status.issues.join(" ")}>Can&apos;t generate on {modelName(status.model)}</span>
}

/** The editor for one shot's locks, with the scene's locks alongside. */
export function LockedMediaEditor({ productionId, shotNumber, shotCount, shotTitle, view, status, onClose, onSaved, save: saveImpl = saveLockScope, audioActions = DEFAULT_AUDIO_ACTIONS, initialScope = "shot", onScopeChange }: {
  productionId: string
  shotNumber: number
  shotCount: number
  shotTitle: string
  view: FilmLockView
  status?: ShotLockStatus
  onClose: () => void
  onSaved: () => Promise<void>
  /** The save call; the dev preview passes a stand-in. */
  save?: typeof saveLockScope
  audioActions?: AudioActions
  /** The tab to open on; the editor reopens on the same tab after a save reloads it. */
  initialScope?: "shot" | "scene"
  onScopeChange?: (scope: "shot" | "scene") => void
}) {
  const client = useIsClient()
  const [scope, setScopeState] = useState<"shot" | "scene">(initialScope)
  const setScope = (next: "shot" | "scene") => { setScopeState(next); onScopeChange?.(next) }
  const [shotRows, setShotRows] = useState<Row[]>(() => (view.shots[shotNumber] ?? []).map(b => toRow(b, view.library)))
  const [sceneRows, setSceneRows] = useState<Row[]>(() => view.scene.map(b => toRow(b, view.library)))
  const [picking, setPicking] = useState(false)
  const [addingAudio, setAddingAudio] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [confirmScene, setConfirmScene] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const [dirty, setDirty] = useState<{ shot: boolean; scene: boolean }>({ shot: false, scene: false })

  const rows = scope === "shot" ? shotRows : sceneRows
  const setRows = (update: (rows: Row[]) => Row[]) => {
    if (scope === "shot") setShotRows(update)
    else setSceneRows(update)
    setDirty(d => ({ ...d, [scope]: true }))
    setMessage(null)
  }
  const combinedCount = imageCount([...sceneRows, ...shotRows])
  const visible = expanded ? rows : rows.slice(0, INITIAL_ROWS)

  const save = async () => {
    if (scope === "scene" && !confirmScene) { setConfirmScene(true); return }
    setSaving(true)
    setMessage(null)
    const result = await saveImpl({
      productionId, scope, shotNumber: scope === "shot" ? shotNumber : null, expectedRevision: view.revision,
      bindings: rows.map(r => ({ assetId: r.assetId, assetUrl: r.assetUrl, role: r.role, entityLabel: r.entityLabel.trim(), viewLabel: r.viewLabel.trim() })),
    }).catch(() => ({ error: "Could not save. Check your connection and try again." }))
    setSaving(false)
    setConfirmScene(false)
    if ("error" in result && result.error) { setMessage({ tone: "error", text: result.error }); return }
    setDirty(d => ({ ...d, [scope]: false }))
    setMessage({ tone: "ok", text: "Locks saved." })
    await onSaved()
  }

  if (!client) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-label={`Locked media for shot ${shotNumber}`} onClick={e => e.stopPropagation()} className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-obsidian-900 text-white sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-medium">Locked media · Shot {shotNumber}</h2>
            <p className="truncate text-xs text-white/50">{shotTitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-white/60 hover:bg-white/5"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-[13px] leading-relaxed text-white/65">
            Locked images are sent to the video model as actual image inputs; if the model can&apos;t take the whole set, the shot won&apos;t generate. Locked audio plays in the finished export exactly as approved. Nothing is dropped, swapped or stretched. This guarantees the inputs, not perfect likeness or lip-sync.
          </p>

          <div role="tablist" aria-label="Apply to" className="grid grid-cols-2 gap-1 rounded-xl bg-black/30 p-1 text-sm">
            {(["shot", "scene"] as const).map(id => (
              <button key={id} type="button" role="tab" aria-selected={scope === id} onClick={() => { setScope(id); setExpanded(false); setConfirmScene(false); setMessage(null) }}
                className={`rounded-lg px-3 py-2 transition-colors ${scope === id ? "bg-gold-200 font-medium text-[#1a160e]" : "text-white/70 hover:text-white"}`}>
                {id === "shot" ? `This shot (${imageCount(shotRows)})` : `Entire scene (${imageCount(sceneRows)})`}
              </button>
            ))}
          </div>

          {scope === "shot" && sceneRows.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-white/70">From scene · {imageCount(sceneRows)} image{imageCount(sceneRows) === 1 ? "" : "s"} required on every shot</span>
                <button type="button" onClick={() => setScope("scene")} className="text-gold-200 hover:underline">Edit scene</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sceneRows.map(r => (
                  <span key={r.key} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 py-0.5 pl-0.5 pr-2 text-[11px] text-white/75">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.preview} alt="" className="size-5 rounded-full object-cover" />
                    {LOCK_ROLE_LABELS[r.role]}{r.entityLabel ? ` · ${r.entityLabel}` : ""}{r.viewLabel ? ` / ${r.viewLabel}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white/50"><ImageIcon className="size-3.5" aria-hidden /> Images</h3>
          <section aria-label={scope === "shot" ? "This shot's locks" : "Scene locks"} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-white/55">
              <span>{rows.length} binding{rows.length === 1 ? "" : "s"} · {imageCount(rows)} image{imageCount(rows) === 1 ? "" : "s"}</span>
              <span>Limit {view.safetyLimit} per {scope === "shot" ? "shot" : "scene"} (app safety limit, not a model limit)</span>
            </div>
            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 px-4 py-5 text-center text-sm text-white/50">No images locked {scope === "shot" ? "on this shot" : "for the whole scene"} yet.</p>
            ) : (
              <ul className={`space-y-2 ${expanded ? "max-h-[46dvh] overflow-y-auto pr-1" : ""}`}>
                {visible.map(r => (
                  <li key={r.key} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto_auto_auto]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.preview} alt="" className="size-12 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-white">{r.name}</p>
                      <p className="truncate text-[11px] text-white/45">{r.alias ?? "Library image"}{r.assetUrl ? " · pinned version" : " · new"}</p>
                    </div>
                    <div className="col-span-3 row-start-2 grid grid-cols-3 gap-2 sm:col-span-3 sm:col-start-3 sm:row-start-1 sm:flex">
                      <select aria-label="Role" value={r.role} onChange={e => setRows(list => list.map(x => x.key === r.key ? { ...x, role: e.target.value as LockRole } : x))} className="h-8 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs">
                        {LOCK_ROLES.map(role => <option key={role} value={role}>{LOCK_ROLE_LABELS[role]}</option>)}
                      </select>
                      <input aria-label="Entity" placeholder="Entity (e.g. Sam)" value={r.entityLabel} maxLength={60} onChange={e => setRows(list => list.map(x => x.key === r.key ? { ...x, entityLabel: e.target.value } : x))} className="h-8 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs placeholder:text-white/30 sm:w-28" />
                      <input aria-label="View" placeholder="View (e.g. profile)" value={r.viewLabel} maxLength={60} onChange={e => setRows(list => list.map(x => x.key === r.key ? { ...x, viewLabel: e.target.value } : x))} className="h-8 min-w-0 rounded-lg border border-white/10 bg-black/40 px-2 text-xs placeholder:text-white/30 sm:w-28" />
                    </div>
                    <button type="button" onClick={() => setRows(list => list.filter(x => x.key !== r.key))} className="col-start-3 row-start-1 rounded-lg px-2 py-1 text-xs text-red-200/80 hover:bg-red-500/10 sm:col-start-6">Remove</button>
                  </li>
                ))}
              </ul>
            )}
            {rows.length > INITIAL_ROWS && (
              <button type="button" onClick={() => setExpanded(v => !v)} className="text-xs text-gold-200 hover:underline">{expanded ? "Show fewer" : `Show all ${rows.length}`}</button>
            )}
            <button type="button" onClick={() => setPicking(true)} disabled={rows.length >= view.safetyLimit || view.library.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/35 py-2.5 text-sm text-gold-100 hover:bg-gold-500/[0.06] disabled:opacity-40">
              + Add images from this film&apos;s library
            </button>
            {view.library.length === 0 && <p className="text-xs text-white/45">Upload references to the film first; locks use its library.</p>}
          </section>

          <section className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-[13px]">
            <p className="text-white/85">Shot {shotNumber} needs <strong>{combinedCount}</strong> image{combinedCount === 1 ? "" : "s"} in total (scene + this shot).</p>
            {dirty.shot || dirty.scene ? (
              <p className="mt-1 text-xs text-white/50">Not checked yet. Save to check against the shot&apos;s model.</p>
            ) : status?.status === "blocked" ? (
              <div className="mt-2 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3 text-amber-100">
                <p className="font-medium">Cannot generate with this configuration.</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-amber-100/90">{status.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
                <p className="mt-2 text-xs text-amber-100/70">Your locks are saved. No video job has been submitted. Change this shot&apos;s model in Sequence settings, or edit the locks.</p>
              </div>
            ) : status?.status === "mapped" ? (
              <p className="mt-1 text-xs text-[#8fd1b9]">{status.requiredImageCount} required · {status.requiredImageCount} mapped to the request. Files are checked again when you generate.</p>
            ) : (
              <p className="mt-1 text-xs text-white/50">Not checked.</p>
            )}
          </section>

          <div className="border-t border-white/[0.06] pt-4">
            <AudioPlacements productionId={productionId} view={view} scope={scope} shotNumber={shotNumber} actions={audioActions} onChanged={onSaved}
              onAdd={() => setAddingAudio(true)}
              disabledReason={dirty.shot || dirty.scene ? "Save or discard your image changes first; audio saves straight away." : undefined} />
          </div>

          {message && <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-xl px-3 py-2 text-sm ${message.tone === "error" ? "border border-red-400/30 bg-red-500/10 text-red-100" : "border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]"}`}>{message.text}</p>}
        </div>

        <footer className="shrink-0 border-t border-white/[0.06] p-4">
          {confirmScene && <p className="mb-2 text-xs text-amber-100">Scene locks apply to all {shotCount} shots in this film and can&apos;t be removed per shot. Save again to confirm.</p>}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm text-white/80 hover:bg-white/5">Close</button>
            <button type="button" onClick={() => void save()} disabled={saving || !dirty[scope]} className="flex-[2] rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 py-2.5 text-sm font-medium text-black disabled:opacity-40">
              {saving ? "Saving…" : confirmScene ? `Confirm: lock for all ${shotCount} shots` : scope === "scene" ? "Save scene image locks" : "Save shot image locks"}
            </button>
          </div>
        </footer>

        {addingAudio && (
          <AudioLibraryPanel productionId={productionId} view={view} actions={audioActions} onChanged={onSaved} onClose={() => setAddingAudio(false)}
            target={{ scope, shotNumber, label: scope === "shot" ? `shot ${shotNumber}` : `the whole scene (${shotCount} shots)` }} />
        )}

        {picking && (
          <LibraryPicker
            library={view.library}
            onClose={() => setPicking(false)}
            onAdd={(assets) => {
              setRows(list => {
                const next = [...list]
                for (const asset of assets) {
                  const role = DEFAULT_ROLE[asset.role]
                  const key = `new:${asset.id}|${role}|`
                  if (next.some(r => r.key === key || (r.assetId === asset.id && r.role === role && !r.entityLabel))) continue
                  next.push({ key, assetId: asset.id, name: asset.name, preview: asset.url, alias: asset.label, role, entityLabel: "", viewLabel: "" })
                }
                return next.slice(0, view.safetyLimit)
              })
              setPicking(false)
            }}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Multi-select from the film's library. Checked items stay checked while the list is filtered. */
function LibraryPicker({ library, onClose, onAdd }: { library: ProductionAsset[]; onClose: () => void; onAdd: (assets: ProductionAsset[]) => void }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? library.filter(a => `${a.name} ${a.label ?? ""} ${a.role}`.toLowerCase().includes(q)) : library
  }, [library, query])
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-obsidian-900">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] p-4">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, tag or type" aria-label="Search the library" className="h-10 w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 text-sm placeholder:text-white/35" />
        </label>
        <button type="button" onClick={onClose} aria-label="Close picker" className="grid size-10 place-items-center rounded-full text-white/60 hover:bg-white/5"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {shown.length === 0 ? <p className="py-8 text-center text-sm text-white/50">No images match “{query}”.</p> : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {shown.map(asset => {
              const on = selected.has(asset.id)
              return (
                <li key={asset.id}>
                  <button type="button" aria-pressed={on} aria-label={`${asset.label ?? ""} ${asset.name}`.trim()} onClick={() => setSelected(s => { const n = new Set(s); if (n.has(asset.id)) n.delete(asset.id); else n.add(asset.id); return n })}
                    className={`relative block w-full overflow-hidden rounded-xl border text-left transition-colors ${on ? "border-gold-300" : "border-white/10 hover:border-white/30"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt="" className="aspect-square w-full object-cover" />
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
          Add {selected.size || ""} image{selected.size === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  )
}
