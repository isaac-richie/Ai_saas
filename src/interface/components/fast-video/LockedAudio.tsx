"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AudioLines, Loader2, Mic, Music2, Sparkles, Upload, Waves, X, Zap } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import {
  AI_AUDIO_CAPABILITIES, AUDIO_PURPOSES, AUDIO_PURPOSE_LABELS, defaultPlacement, voicePreviewUrl,
  type AudioAsset, type AudioBinding, type AudioPurpose,
} from "@/core/services/long-form-audio"
import {
  createAiAudio, discardAudio, lockAudio, refreshAiAudio, registerUploadedAudio, removeAudioPlacement, updateAudioPlacement,
} from "@/core/actions/long-form-audio"
import type { FilmLockView } from "@/core/actions/long-form-locks"

type View = FilmLockView
type Placement = Omit<AudioBinding, "id" | "scopeType" | "shotNumber" | "audioAssetId" | "sha256" | "purpose" | "anchorTitle">

const AUDIO_ACCEPT = ".mp3,.m4a,.aac,.wav,.ogg,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,audio/ogg"
const AUDIO_EXT: Record<string, string> = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg" }
const MAX_UPLOAD_MB = 40

/** Uploads a recording straight from the browser to the creator's own audio folder. */
export async function uploadAudioFile(file: File): Promise<string> {
  const ext = AUDIO_EXT[file.type] ?? file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["mp3", "m4a", "aac", "wav", "ogg"].includes(ext)) throw new Error("Use an MP3, M4A, AAC, WAV or OGG file.")
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`Recordings must be under ${MAX_UPLOAD_MB} MB.`)
  const db = createClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) throw new Error("Please sign in again.")
  const path = `${user.id}/audio/${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage.from("elements").upload(path, file, { contentType: file.type || `audio/${ext}`, upsert: false })
  if (error) throw new Error("The upload did not finish. Try again.")
  return path
}

export const DEFAULT_AUDIO_ACTIONS = { uploadAudioFile, registerUploadedAudio, createAiAudio, refreshAiAudio, discardAudio, lockAudio, updateAudioPlacement, removeAudioPlacement }
export type AudioActions = typeof DEFAULT_AUDIO_ACTIONS

export const audioSrc = (path: string | null) => {
  if (!path) return ""
  if (/^(https?:|\/|blob:|data:)/.test(path)) return path
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/elements/${path}`
}
export const fmtSec = (ms: number | null | undefined) => ms == null ? "–" : `${(ms / 1000).toFixed(1)} s`

const PURPOSE_ICON: Record<AudioPurpose, typeof Mic> = { dialogue: Mic, music: Music2, sound_effect: Zap, ambience: Waves }

export function PurposeIcon({ purpose, className }: { purpose: AudioPurpose; className?: string }) {
  const Icon = PURPOSE_ICON[purpose]
  return <Icon className={className} aria-hidden />
}

/** How long the scope is in the plan: one shot, or the whole film. */
export function plannedScopeMs(view: View, scope: "shot" | "scene", shotNumber: number) {
  if (scope === "shot") return Math.round((view.shotSeconds[shotNumber - 1] ?? 0) * 1000)
  return Math.round(view.shotSeconds.reduce((sum, s) => sum + s, 0) * 1000)
}

// ── Library: upload, create with AI, preview, Use and lock ──────────────────────────────────────

type LockTarget = { scope: "shot" | "scene"; shotNumber: number; label: string }

export function AudioLibraryPanel({ productionId, view, actions = DEFAULT_AUDIO_ACTIONS, target, onChanged, onClose, initialTab = "library" }: {
  productionId: string
  view: View
  actions?: AudioActions
  /** Where Use and lock places a recording; omitted when managing the library alone. */
  target?: LockTarget
  onChanged: () => Promise<void>
  onClose: () => void
  initialTab?: "library" | "upload" | "ai"
}) {
  const [tab, setTab] = useState<"library" | "upload" | "ai">(initialTab)
  const [assets, setAssets] = useState<AudioAsset[]>(view.audio.assets)
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const [locking, setLocking] = useState<AudioAsset | null>(null)
  const generating = assets.some(a => a.status === "generating")

  // Poll generating takes until they finish.
  const refreshRef = useRef(actions.refreshAiAudio)
  useEffect(() => { refreshRef.current = actions.refreshAiAudio }, [actions.refreshAiAudio])
  useEffect(() => {
    if (!generating) return
    const timer = setInterval(async () => {
      const pending = assets.filter(a => a.status === "generating")
      for (const asset of pending) {
        const result = await refreshRef.current({ assetId: asset.id }).catch(() => null)
        if (!result?.data) continue
        setAssets(list => {
          const byId = new Map(list.map(a => [a.id, a]))
          for (const updated of result.data!) byId.set(updated.id, updated)
          return [...byId.values()]
        })
        if (result.data.some(a => a.status !== "generating")) void onChanged()
      }
    }, 4000)
    return () => clearInterval(timer)
  }, [generating, assets, onChanged])

  const added = (asset: AudioAsset) => {
    setAssets(list => [...list.filter(a => a.id !== asset.id), asset])
    setTab("library")
    void onChanged()
  }

  const ready = assets.filter(a => a.status === "ready")
  const others = assets.filter(a => a.status !== "ready")
  const lockedIds = new Set(view.audio.bindings.map(b => b.audioAssetId))

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-obsidian-900" role="region" aria-label="Film audio">
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <AudioLines className="size-4 text-gold-300/80" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{target ? `Add audio to ${target.label}` : "Film audio"}</p>
        <button type="button" onClick={onClose} aria-label="Close audio" className="grid size-9 place-items-center rounded-full text-white/60 hover:bg-white/5"><X size={18} /></button>
      </div>
      <div role="tablist" aria-label="Audio source" className="mx-4 mt-3 grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-black/30 p-1 text-[13px]">
        {([["library", `Film audio (${assets.length})`], ["upload", "Upload audio"], ["ai", "Create with AI"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} disabled={id === "ai" && !view.audio.aiEnabled} onClick={() => { setTab(id); setMessage(null) }}
            className={`rounded-lg px-2 py-2 transition-colors disabled:opacity-40 ${tab === id ? "bg-gold-200 font-medium text-[#1a160e]" : "text-white/70 hover:text-white"}`}>{label}</button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "library" && (
          <div className="space-y-2">
            {assets.length === 0 && <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/50">No audio in this film yet. Upload a recording or create one with AI.</p>}
            {[...ready, ...others].map(asset => (
              <AudioAssetRow key={asset.id} asset={asset} locked={lockedIds.has(asset.id)}
                onUse={target && asset.status === "ready" ? () => { setLocking(asset); setMessage(null) } : undefined}
                onDiscard={!lockedIds.has(asset.id) && !(asset.status === "generating" && asset.providerTaskId) ? async () => {
                  const result = await actions.discardAudio({ assetId: asset.id }).catch(() => ({ error: "Could not remove the take." }))
                  if (result.error) { setMessage({ tone: "error", text: result.error }); return }
                  setAssets(list => list.filter(a => a.id !== asset.id))
                  void onChanged()
                } : undefined}
              />
            ))}
          </div>
        )}
        {tab === "upload" && <UploadAudioForm productionId={productionId} actions={actions} onAdded={added} onError={text => setMessage({ tone: "error", text })} />}
        {tab === "ai" && <CreateAudioForm productionId={productionId} view={view} actions={actions} onAdded={added} onError={text => setMessage({ tone: "error", text })} />}
        {message && <p role={message.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-xl px-3 py-2 text-sm ${message.tone === "error" ? "border border-red-400/30 bg-red-500/10 text-red-100" : "border border-[#b6ddd3]/30 bg-[#b6ddd3]/10 text-[#dff1ec]"}`}>{message.text}</p>}
      </div>

      {locking && target && (
        <UseAndLock productionId={productionId} view={view} asset={locking} target={target} actions={actions}
          onCancel={() => setLocking(null)}
          onLocked={async () => { setLocking(null); setMessage({ tone: "ok", text: `Locked to ${target.label}.` }); await onChanged(); onClose() }}
          onError={text => { setLocking(null); setMessage({ tone: "error", text }) }}
        />
      )}
    </div>
  )
}

function AudioAssetRow({ asset, locked, onUse, onDiscard }: { asset: AudioAsset; locked: boolean; onUse?: () => void; onDiscard?: () => void }) {
  const state = asset.status === "generating" ? <span className="flex items-center gap-1 text-white/55"><Loader2 className="size-3 animate-spin" /> Creating…</span>
    : asset.status === "failed" ? <span className="text-red-200/90">Failed</span>
    : asset.status === "unknown" ? <span className="text-amber-200">Unconfirmed</span>
    : locked ? <span className="text-gold-200">Locked</span>
    : <span className="text-white/55">Candidate</span>
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3" data-testid="audio-asset">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#b6ddd3]/10 text-[#b6ddd3]"><PurposeIcon purpose={asset.purpose} className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-white">{asset.name}</p>
          <p className="flex flex-wrap gap-x-2 text-[11px] text-white/45">
            <span>{AUDIO_PURPOSE_LABELS[asset.purpose]}</span><span>{asset.origin === "uploaded" ? "Uploaded" : "AI-created"}</span>
            {asset.durationMs ? <span className="tabular-nums">{fmtSec(asset.durationMs)}</span> : null}{state}
          </p>
        </div>
      </div>
      {asset.status === "ready" && asset.playbackPath && (
        // Preview before locking: the exact file that will be locked.
        <audio controls preload="none" src={audioSrc(asset.playbackPath)} className="mt-2 h-8 w-full" aria-label={`Preview ${asset.name}`} />
      )}
      {asset.status === "failed" && asset.errorMessage && <p className="mt-2 text-xs text-red-100/80">{asset.errorMessage} Any approved recording stays as it was.</p>}
      {asset.status === "unknown" && <p className="mt-2 text-xs text-amber-100/80">We couldn&apos;t confirm this request started. It isn&apos;t retried automatically, so it can&apos;t be paid for twice. You can remove it after a few minutes.</p>}
      {(onUse || onDiscard) && (
        <div className="mt-2 flex gap-2">
          {onUse && <button type="button" onClick={onUse} className="rounded-lg bg-gold-200 px-3 py-1.5 text-xs font-medium text-[#1a160e]">Use and lock</button>}
          {onDiscard && <button type="button" onClick={onDiscard} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/5">Remove take</button>}
        </div>
      )}
    </div>
  )
}

function UploadAudioForm({ productionId, actions, onAdded, onError }: { productionId: string; actions: AudioActions; onAdded: (a: AudioAsset) => void; onError: (text: string) => void }) {
  const [purpose, setPurpose] = useState<AudioPurpose>("dialogue")
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const choose = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const storagePath = await actions.uploadAudioFile(file)
      const result = await actions.registerUploadedAudio({ productionId, storagePath, name: file.name.slice(0, 160), purpose })
      if (result.error || !result.data) onError(result.error || "Could not save the recording.")
      else onAdded(result.data)
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Upload failed.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }
  return (
    <div className="space-y-3 text-sm">
      <PurposePicker value={purpose} onChange={setPurpose} />
      <input ref={input} type="file" accept={AUDIO_ACCEPT} hidden onChange={e => void choose(e.target.files?.[0])} data-testid="audio-file" />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gold-400/35 py-3 text-gold-100 hover:bg-gold-500/[0.06] disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}{busy ? "Checking the recording…" : "Choose a recording"}
      </button>
      <p className="text-xs leading-relaxed text-white/45">MP3, M4A, AAC, WAV or OGG, up to {MAX_UPLOAD_MB} MB and 10 minutes. We read its real length before you lock it. Only use audio you have the rights to.</p>
    </div>
  )
}

function PurposePicker({ value, onChange }: { value: AudioPurpose; onChange: (p: AudioPurpose) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs text-white/55">Purpose</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {AUDIO_PURPOSES.map(p => (
          <button key={p} type="button" aria-pressed={value === p} onClick={() => onChange(p)}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs ${value === p ? "border-gold-300/70 bg-gold-200/10 text-gold-50" : "border-white/10 text-white/70 hover:border-white/25"}`}>
            <PurposeIcon purpose={p} className="size-3.5 shrink-0" />{AUDIO_PURPOSE_LABELS[p]}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function CreateAudioForm({ productionId, view, actions, onAdded, onError }: { productionId: string; view: View; actions: AudioActions; onAdded: (a: AudioAsset) => void; onError: (text: string) => void }) {
  const [purpose, setPurpose] = useState<AudioPurpose>("dialogue")
  const [text, setText] = useState("")
  const [voiceId, setVoiceId] = useState(view.audio.voices[0]?.id ?? "")
  const [targetSec, setTargetSec] = useState(30)
  const [instrumental, setInstrumental] = useState(true)
  const [loop, setLoop] = useState(true)
  const [busy, setBusy] = useState(false)
  const capability = AI_AUDIO_CAPABILITIES[purpose]
  const submit = async () => {
    setBusy(true)
    const result = await actions.createAiAudio({
      productionId, purpose, text, voiceId: purpose === "dialogue" ? voiceId : undefined,
      targetSec: purpose === "music" ? targetSec : undefined, instrumental: purpose === "music" ? instrumental : undefined,
      loop: purpose === "ambience" || purpose === "sound_effect" ? loop : undefined,
    }).catch(() => ({ error: "Could not start the audio. Check your connection." } as { error: string; data?: AudioAsset }))
    setBusy(false)
    if (result.data) onAdded(result.data)
    if (result.error) onError(result.error)
    else setText("")
  }
  return (
    <div className="space-y-3 text-sm">
      <PurposePicker value={purpose} onChange={p => { setPurpose(p); setLoop(p === "ambience") }} />
      {purpose === "dialogue" && (
        <label className="block text-xs text-white/55">Voice
          <select value={voiceId} onChange={e => setVoiceId(e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-white">
            {view.audio.voices.map(v => <option key={v.id} value={v.id}>{v.name} · {v.note}</option>)}
          </select>
          {voiceId && <audio controls preload="none" src={voicePreviewUrl(voiceId)} className="mt-1.5 h-8 w-full" aria-label="Voice sample" />}
        </label>
      )}
      <label className="block text-xs text-white/55">{purpose === "dialogue" ? "Line to speak" : "Describe the sound"}
        <textarea value={text} onChange={e => setText(e.target.value)} maxLength={capability.textLimit} rows={purpose === "dialogue" ? 4 : 3}
          placeholder={purpose === "dialogue" ? "Lord, give me the strength for today…" : purpose === "music" ? "Slow solo piano, hopeful, morning light" : purpose === "ambience" ? "Steady rain on a window, distant thunder" : "A door creaks open"}
          className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 p-2 text-sm text-white placeholder:text-white/30" />
        <span className="mt-0.5 block text-right tabular-nums text-white/35">{text.length}/{capability.textLimit}</span>
      </label>
      {purpose === "music" && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-white/70">
          <label className="flex items-center gap-2">Target length
            <input type="number" min={capability.minSec} max={capability.maxSec} value={targetSec} onChange={e => setTargetSec(Number(e.target.value))} className="h-8 w-20 rounded-lg border border-white/10 bg-black/40 px-2 text-sm text-white" /> s
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={instrumental} onChange={e => setInstrumental(e.target.checked)} /> Instrumental</label>
        </div>
      )}
      {(purpose === "ambience" || purpose === "sound_effect") && (
        <label className="flex items-center gap-2 text-xs text-white/70"><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Make it loop seamlessly</label>
      )}
      <p className="text-xs leading-relaxed text-white/45">
        {purpose === "music" ? "The length is a target; we check the real length before you lock it." : capability.durationControl ? "" : "Its length can't be set in advance; we show the real length when it's ready."}{" "}
        Creating a take uses {capability.units} generation{capability.units === 1 ? "" : "s"} from your allowance, including takes you don&apos;t keep. Nothing is locked until you preview it and choose Use and lock.
      </p>
      <button type="button" disabled={busy || !text.trim()} onClick={() => void submit()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-gold-100 via-gold-300 to-gold-500 py-2.5 text-sm font-medium text-black disabled:opacity-40">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Create take
      </button>
    </div>
  )
}

/** The last step before a recording becomes mandatory: check its real length against where it goes. */
function UseAndLock({ productionId, view, asset, target, actions, onCancel, onLocked, onError }: {
  productionId: string; view: View; asset: AudioAsset; target: LockTarget; actions: AudioActions
  onCancel: () => void; onLocked: () => Promise<void>; onError: (text: string) => void
}) {
  const base = defaultPlacement(asset.purpose, target.scope)
  const [playback, setPlayback] = useState(base.playback)
  const [nativeAudio, setNativeAudio] = useState<"keep" | "mute">(asset.purpose === "dialogue" ? "mute" : "keep")
  const [busy, setBusy] = useState(false)
  const planned = plannedScopeMs(view, target.scope, target.shotNumber)
  const length = asset.durationMs ?? 0
  const tooLong = planned > 0 && length > planned
  const tooShort = target.scope === "scene" && playback === "continuous" && planned > 0 && length < planned

  const lock = async (extra: Partial<Placement>) => {
    setBusy(true)
    const result = await actions.lockAudio({
      productionId, expectedRevision: view.revision, assetId: asset.id, scope: target.scope, shotNumber: target.scope === "shot" ? target.shotNumber : null,
      placement: { ...base, playback, nativeAudio: asset.purpose === "dialogue" ? nativeAudio : base.nativeAudio, ...extra },
    }).catch(() => ({ error: "Could not lock the recording." }))
    setBusy(false)
    if (result.error) onError(result.error)
    else await onLocked()
  }

  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/60 sm:items-center sm:justify-center" role="dialog" aria-label={`Use and lock ${asset.name}`}>
      <div className="w-full max-w-md space-y-3 rounded-t-2xl border border-white/10 bg-obsidian-900 p-4 text-sm sm:rounded-2xl">
        <p className="font-medium">Use and lock “{asset.name}”</p>
        <p className="text-xs text-white/60">This exact recording ({fmtSec(length)}) becomes required audio for {target.label}. It stays the same when the video is regenerated.</p>
        {target.scope === "scene" && (
          <fieldset className="space-y-1 text-xs text-white/75">
            <legend className="mb-1 text-white/55">Playback</legend>
            {([["continuous", "Continuous across the scene"], ["once", "Play once at the start"], ["repeat_per_shot", "Repeat at each shot (explicit)"]] as const).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2"><input type="radio" name="playback" checked={playback === id} onChange={() => setPlayback(id)} /> {label}</label>
            ))}
          </fieldset>
        )}
        {asset.purpose === "dialogue" && (
          <fieldset className="space-y-1 text-xs text-white/75">
            <legend className="mb-1 text-white/55">The shot&apos;s own generated sound</legend>
            <label className="flex items-center gap-2"><input type="radio" name="native" checked={nativeAudio === "mute"} onChange={() => setNativeAudio("mute")} /> Mute it under this dialogue (recommended; the original clip is kept)</label>
            <label className="flex items-center gap-2"><input type="radio" name="native" checked={nativeAudio === "keep"} onChange={() => setNativeAudio("keep")} /> Keep it, mixed under the dialogue</label>
            <p className="pt-1 text-white/45">Plays as voice-over. Matching visible lip movement isn&apos;t available in Long Form.</p>
          </fieldset>
        )}
        {(tooLong || tooShort) ? (
          <div className="space-y-2 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-3 text-xs text-amber-100">
            <p>{tooLong ? `${fmtSec(length)} of audio for ${fmtSec(planned)} of planned ${target.scope === "shot" ? "shot" : "scene"}.` : `${fmtSec(length)} of audio for a ${fmtSec(planned)} scene.`} Nothing is stretched, sped up or cut without your choice.</p>
            <div className="flex flex-wrap gap-2">
              {tooLong && <button type="button" disabled={busy} onClick={() => void lock({ sourceOutMs: planned })} className="rounded-lg bg-amber-200 px-2.5 py-1.5 font-medium text-black">Trim to {fmtSec(planned)}</button>}
              {tooLong && <button type="button" disabled={busy} onClick={() => void lock({ overflow: "cut_at_end" })} className="rounded-lg border border-amber-200/40 px-2.5 py-1.5">End it with the {target.scope}</button>}
              {tooShort && <button type="button" disabled={busy} onClick={() => void lock({ loop: true })} className="rounded-lg bg-amber-200 px-2.5 py-1.5 font-medium text-black">Loop it</button>}
              <button type="button" disabled={busy} onClick={() => void lock({})} className="rounded-lg border border-amber-200/40 px-2.5 py-1.5">Lock; fix before export</button>
            </div>
            <p className="text-amber-100/70">Or extend the shot in the plan, or choose another take.</p>
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-white/15 py-2 text-white/80">Cancel</button>
          {!(tooLong || tooShort) && <button type="button" disabled={busy} onClick={() => void lock({})} className="flex-[2] rounded-xl bg-gold-200 py-2 font-medium text-[#1a160e] disabled:opacity-40">{busy ? "Locking…" : "Use and lock"}</button>}
        </div>
      </div>
    </div>
  )
}

// ── Placements in the editor ────────────────────────────────────────────────────────────────────

export function AudioPlacements({ productionId, view, scope, shotNumber, actions = DEFAULT_AUDIO_ACTIONS, onChanged, onAdd, disabledReason }: {
  productionId: string
  view: View
  scope: "shot" | "scene"
  shotNumber: number
  actions?: AudioActions
  onChanged: () => Promise<void>
  onAdd: () => void
  /** Set when audio can't change right now (for example, unsaved image edits). */
  disabledReason?: string
}) {
  const assets = useMemo(() => new Map(view.audio.assets.map(a => [a.id, a])), [view.audio.assets])
  const bindings = view.audio.bindings.filter(b => scope === "scene" ? b.scopeType === "scene" : b.scopeType === "shot" && b.shotNumber === shotNumber)
  const sceneBindings = scope === "shot" ? view.audio.bindings.filter(b => b.scopeType === "scene") : []
  const issuesFor = (id: string) => view.audio.issues.filter(i => i.bindingId === id)
  const [open, setOpen] = useState<string | null>(null)

  if (!view.audio.enabled) return null
  return (
    <section aria-label={scope === "shot" ? "This shot's audio" : "Scene audio"} className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/55">
        <span className="flex items-center gap-1.5"><AudioLines className="size-3.5" aria-hidden /> Audio · {bindings.length} placement{bindings.length === 1 ? "" : "s"}</span>
        <span>Plays in the finished export</span>
      </div>
      {!view.audio.available && <p className="rounded-lg border border-amber-300/25 bg-amber-300/[0.05] px-3 py-2 text-xs text-amber-100/90">Locked audio needs a database update (migration 0053) before it can be saved.</p>}
      {sceneBindings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[11px] text-white/70">
          <span className="text-white/45">From scene:</span>
          {sceneBindings.map(b => <span key={b.id} className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-2 py-0.5"><PurposeIcon purpose={b.purpose} className="size-3" />{assets.get(b.audioAssetId)?.name ?? "Recording"}</span>)}
        </div>
      )}
      {bindings.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-4 text-center text-xs text-white/50">No audio locked {scope === "shot" ? "on this shot" : "for the whole scene"}.</p>
      ) : (
        <ul className="space-y-2">
          {bindings.map(b => (
            <AudioPlacementRow key={b.id} productionId={productionId} view={view} binding={b} asset={assets.get(b.audioAssetId)} issues={issuesFor(b.id).map(i => i.message)}
              open={open === b.id} onToggle={() => setOpen(o => o === b.id ? null : b.id)} actions={actions} onChanged={onChanged} disabledReason={disabledReason} />
          ))}
        </ul>
      )}
      <button type="button" onClick={onAdd} disabled={Boolean(disabledReason) || !view.audio.available} title={disabledReason}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#b6ddd3]/35 py-2.5 text-sm text-[#dff1ec] hover:bg-[#b6ddd3]/[0.06] disabled:opacity-40">
        + Upload audio or create with AI
      </button>
      {disabledReason && <p className="text-xs text-white/45">{disabledReason}</p>}
    </section>
  )
}

function AudioPlacementRow({ productionId, view, binding, asset, issues, open, onToggle, actions, onChanged, disabledReason }: {
  productionId: string; view: View; binding: AudioBinding; asset?: AudioAsset; issues: string[]; open: boolean; onToggle: () => void
  actions: AudioActions; onChanged: () => Promise<void>; disabledReason?: string
}) {
  const [draft, setDraft] = useState<Placement>(() => ({ ...binding }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Placement>(key: K, value: Placement[K]) => setDraft(d => ({ ...d, [key]: value }))
  const moved = issues.some(i => /was locked to/.test(i))
  const run = async (fn: () => Promise<{ error?: string }>) => {
    setBusy(true); setError(null)
    const result = await fn().catch(() => ({ error: "Could not save. Check your connection." }))
    setBusy(false)
    if (result.error) setError(result.error)
    else await onChanged()
  }
  const save = (confirmShot = false) => run(() => actions.updateAudioPlacement({
    productionId, expectedRevision: view.revision, bindingId: binding.id, confirmShot,
    placement: { sourceInMs: draft.sourceInMs, sourceOutMs: draft.sourceOutMs, offsetMs: draft.offsetMs, playback: draft.playback, gain: draft.gain, fadeInMs: draft.fadeInMs, fadeOutMs: draft.fadeOutMs, loop: draft.loop, overflow: draft.overflow, nativeAudio: draft.nativeAudio, dialogueDisplay: "voice_over" },
  }))
  const msInput = (label: string, key: "offsetMs" | "sourceInMs" | "fadeInMs" | "fadeOutMs") => (
    <label className="flex flex-col gap-1 text-[11px] text-white/55">{label}
      <input type="number" min={0} step={0.1} value={(draft[key] / 1000).toString()} onChange={e => set(key, Math.max(0, Math.round(Number(e.target.value || 0) * 1000)))} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white" />
    </label>
  )
  return (
    <li className={`rounded-xl border bg-white/[0.02] ${issues.length ? "border-amber-300/30" : "border-white/[0.07]"}`} data-testid="audio-placement">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-2.5 p-2.5 text-left">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#b6ddd3]/10 text-[#b6ddd3]"><PurposeIcon purpose={binding.purpose} className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-white">{asset?.name ?? "Missing recording"}</span>
          <span className="block truncate text-[11px] text-white/45">
            {AUDIO_PURPOSE_LABELS[binding.purpose]} · {asset?.durationMs && (binding.sourceInMs > 0 || (binding.sourceOutMs != null && binding.sourceOutMs < asset.durationMs)) ? `${fmtSec((binding.sourceOutMs ?? asset.durationMs) - binding.sourceInMs)} of ${fmtSec(asset.durationMs)}` : fmtSec(asset?.durationMs)} · {binding.playback === "continuous" ? "Continuous" : binding.playback === "repeat_per_shot" ? "Each shot" : `At ${fmtSec(binding.offsetMs)}`} · {Math.round(binding.gain * 100)}%
          </span>
        </span>
        <span className={`shrink-0 text-[11px] ${issues.length ? "text-amber-200" : "text-[#8fd1b9]"}`}>{issues.length ? "Needs attention" : "Ready"}</span>
      </button>
      {issues.length > 0 && <ul className="mx-2.5 mb-2 list-disc space-y-0.5 pl-4 text-[11px] text-amber-100/90">{issues.map((i, n) => <li key={n}>{i}</li>)}</ul>}
      {open && (
        <div className="space-y-3 border-t border-white/[0.06] p-2.5">
          {asset?.playbackPath && <audio controls preload="none" src={audioSrc(asset.playbackPath)} className="h-8 w-full" aria-label={`Preview ${asset.name}`} />}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {msInput(binding.scopeType === "shot" ? "Starts at (s into shot)" : "Starts at (s into scene)", "offsetMs")}
            <label className="flex flex-col gap-1 text-[11px] text-white/55">Volume %
              <input type="number" min={0} max={200} step={5} value={Math.round(draft.gain * 100)} onChange={e => set("gain", Math.max(0, Math.min(2, Number(e.target.value || 0) / 100)))} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white" />
            </label>
            {msInput("Fade in (s)", "fadeInMs")}
            {msInput("Fade out (s)", "fadeOutMs")}
          </div>
          <details className="text-xs text-white/70">
            <summary className="cursor-pointer text-white/55">More options</summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {msInput("Use from (s)", "sourceInMs")}
                <label className="flex flex-col gap-1 text-[11px] text-white/55">Use until (s, blank = end)
                  <input type="number" min={0} step={0.1} value={draft.sourceOutMs == null ? "" : (draft.sourceOutMs / 1000).toString()} onChange={e => set("sourceOutMs", e.target.value === "" ? null : Math.round(Number(e.target.value) * 1000))} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs text-white" />
                </label>
              </div>
              {binding.scopeType === "scene" && (
                <label className="flex items-center gap-2">Playback
                  <select value={draft.playback} onChange={e => set("playback", e.target.value as Placement["playback"])} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs">
                    <option value="continuous">Continuous across scene</option><option value="once">Play once at selected time</option><option value="repeat_per_shot">Repeat per shot</option>
                  </select>
                </label>
              )}
              <label className="flex items-center gap-2"><input type="checkbox" checked={draft.loop} onChange={e => set("loop", e.target.checked)} /> Loop the chosen part to fill the {binding.scopeType}</label>
              <label className="flex items-center gap-2">If it runs past the {binding.scopeType}
                <select value={draft.overflow} onChange={e => set("overflow", e.target.value as Placement["overflow"])} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs">
                  <option value="block">Stop the export so I can fix it</option><option value="cut_at_end">End it with the {binding.scopeType}</option>
                </select>
              </label>
              {binding.purpose === "dialogue" && (
                <label className="flex items-center gap-2">Shot&apos;s own sound
                  <select value={draft.nativeAudio ?? ""} onChange={e => set("nativeAudio", (e.target.value || null) as Placement["nativeAudio"])} className="h-8 rounded-lg border border-white/10 bg-black/40 px-2 text-xs">
                    <option value="">Not decided</option><option value="mute">Muted under the dialogue</option><option value="keep">Kept under the dialogue</option>
                  </select>
                </label>
              )}
            </div>
          </details>
          {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || Boolean(disabledReason)} onClick={() => void save(moved)} className="rounded-lg bg-gold-200 px-3 py-1.5 text-xs font-medium text-[#1a160e] disabled:opacity-40">{moved ? "Confirm for this shot and save" : "Save changes"}</button>
            <button type="button" disabled={busy || Boolean(disabledReason)} onClick={() => void run(() => actions.removeAudioPlacement({ productionId, expectedRevision: view.revision, bindingId: binding.id }))} className="rounded-lg px-3 py-1.5 text-xs text-red-200/80 hover:bg-red-500/10 disabled:opacity-40">Remove</button>
          </div>
        </div>
      )}
    </li>
  )
}
