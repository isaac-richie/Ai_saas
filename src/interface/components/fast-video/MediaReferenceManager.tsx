"use client"

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { ImagePlus, Film, AudioLines, LockKeyhole, ChevronDown, Loader2, Check } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { continueWithoutAnalysisTarget, labelReferences, MAX_REFERENCE_BYTES, MAX_REFERENCES, REFERENCE_BUCKET, REFERENCE_MIME_TYPES, REFERENCE_ROLES, ROLE_CONTROLS, mediaReferenceSchema, referenceAnalysisSchema, referenceCompatibility, referenceConflicts, referenceRoles, withRoles, type MediaReference } from "@/core/validation/media-reference"
import styles from "./MediaReferenceManager.module.css"

async function getDuration(file: File, kind: "video" | "audio") {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<number>((resolve, reject) => {
      const media = document.createElement(kind)
      const finish = (error?: string) => {
        clearTimeout(timer)
        const duration = media.duration
        media.onloadedmetadata = null
        media.onerror = null
        media.removeAttribute("src")
        media.load()
        if (error || !Number.isFinite(duration) || duration <= 0 || duration > 600) reject(new Error(error || "Use media up to 10 minutes with a readable duration."))
        else resolve(duration)
      }
      const timer = setTimeout(() => finish("Could not read this file. Try MP4, MP3 or WAV."), 10000)
      media.preload = "metadata"
      media.onloadedmetadata = () => finish()
      media.onerror = () => finish("This browser cannot preview that file. Try MP4, MP3 or WAV.")
      media.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}

function ReferencePreview({ reference }: { reference: MediaReference }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const [url, setUrl] = useState("")
  const [error, setError] = useState("")
  const [peaks, setPeaks] = useState<number[]>([])
  useEffect(() => {
    if (mediaRef.current) mediaRef.current.volume = reference.volume
  }, [reference.volume, url])
  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    let context: AudioContext | undefined
    async function load() {
      setError("")
      setUrl("")
      setPeaks([])
      const { data, error: storageError } = await createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(reference.assetPath, 3600)
      if (cancelled) return
      if (storageError || !data) { setError("Preview unavailable. Check the storage migration or replace this file."); return }
      setUrl(data.signedUrl)
      if (reference.mediaType !== "audio") return
      try {
        const response = await fetch(data.signedUrl, { signal: controller.signal })
        if (!response.ok) return
        context = new AudioContext()
        const audio = await context.decodeAudioData(await response.arrayBuffer())
        const channel = audio.getChannelData(0)
        const values = Array.from({ length: 64 }, (_, index) => {
          const start = Math.floor(index * channel.length / 64)
          const end = Math.floor((index + 1) * channel.length / 64)
          let peak = 0
          for (let i = start; i < end; i += 32) peak = Math.max(peak, Math.abs(channel[i]))
          return peak
        })
        if (!cancelled) setPeaks(values)
      } catch { /* The native player remains available when waveform decoding is unsupported. */ }
      finally { if (context && context.state !== "closed") await context.close() }
    }
    void load().catch(() => { if (!cancelled) setError("Could not load this preview.") })
    const timer = setInterval(() => { void load().catch(() => {}) }, 45 * 60 * 1000)
    return () => { cancelled = true; controller.abort(); clearInterval(timer); if (context && context.state !== "closed") void context.close() }
  }, [reference.assetPath, reference.mediaType])

  const playback = {
    ref: (node: HTMLMediaElement | null) => { mediaRef.current = node },
    controls: true, preload: "metadata", src: url,
    onPlay: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      const media = event.currentTarget
      media.volume = reference.volume
      if (media.currentTime < reference.trimStart || media.currentTime >= (reference.trimEnd ?? Infinity)) media.currentTime = reference.trimStart
    },
    onTimeUpdate: (event: React.SyntheticEvent<HTMLMediaElement>) => {
      if (reference.trimEnd && event.currentTarget.currentTime >= reference.trimEnd) event.currentTarget.pause()
    },
    onError: () => setError("This file cannot be played here. Replace it with a browser-supported format."),
  }
  return <div className={styles.preview}>
    {error ? <p className={styles.warning}>{error}</p> : !url ? <p className={styles.hint}>Loading preview...</p> : reference.mediaType === "image" ?
      // Signed, private storage URLs must not be cached by an image optimization proxy.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={`${reference.role}: ${reference.name}`} onError={() => setError("Image preview unavailable.")} /> : reference.mediaType === "video" ?
        <video {...playback} playsInline /> : <>
          {peaks.length > 0 && <svg className={styles.wave} viewBox="0 0 192 40" role="img" aria-label="Audio amplitude waveform">
            {peaks.map((peak, index) => <rect key={index} x={index * 3} y={20 - Math.max(1, peak * 19)} width="2" height={Math.max(2, peak * 38)} rx="1" fill="currentColor" />)}
          </svg>}
          <audio {...playback} />
        </>}
  </div>
}

const thumbCache = new Map<string, string>()

/** Small signed thumbnail for an image reference; other media show their type icon. */
function ReferenceThumb({ reference }: { reference: MediaReference }) {
  const [url, setUrl] = useState(() => thumbCache.get(reference.assetPath) ?? "")
  useEffect(() => {
    if (reference.mediaType !== "image" || thumbCache.has(reference.assetPath)) return
    let cancelled = false
    void createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(reference.assetPath, 3600).then(({ data }) => {
      if (cancelled || !data) return
      thumbCache.set(reference.assetPath, data.signedUrl)
      setUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [reference.assetPath, reference.mediaType])
  const Icon = reference.mediaType === "image" ? ImagePlus : reference.mediaType === "video" ? Film : AudioLines
  return <span className={styles.thumb} aria-hidden>
    {/* Signed, private storage URLs must not be cached by an image optimization proxy. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {url ? <img src={url} alt="" /> : <Icon size={16} />}
  </span>
}

/** Compact multi-select: checkboxes for every role, summarised as "character + location". */
function RolePicker({ reference, disabled, onChange }: { reference: MediaReference; disabled: boolean; onChange: (roles: string[]) => void }) {
  const roles = referenceRoles(reference)
  const options = REFERENCE_ROLES[reference.mediaType] as readonly string[]
  return <details className={styles.rolePicker}>
    <summary aria-label={`Roles: ${roles.join(", ")}`} aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault() }}>
      <span className={styles.roleSummary}>{roles.join(" + ")}</span><ChevronDown size={12} />
    </summary>
    <fieldset className={styles.roleList} disabled={disabled}>
      <legend className={styles.srOnly}>Roles for {reference.name}</legend>
      {options.map((role) => {
        const checked = roles.includes(role)
        return <label key={role} className={styles.roleOption}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => {
              const next = checked ? roles.filter((item) => item !== role) : [...roles, role]
              if (next.length) onChange(next)
            }}
            aria-describedby={ROLE_CONTROLS[role] && reference.mediaType === "image" ? `${reference.id}-${role}` : undefined}
          />
          <span><span className={styles.roleName}>{role}</span>{ROLE_CONTROLS[role] && reference.mediaType === "image" ? <span id={`${reference.id}-${role}`} className={styles.roleControls}>{ROLE_CONTROLS[role]}</span> : null}</span>
        </label>
      })}
      <p className={styles.hint}>Pick every job this file should do. It will guide only these.</p>
    </fieldset>
  </details>
}

export function MediaReferenceManager({ references, onChange, projectId, sceneId, onBusy, disabled = false }: {
  references: MediaReference[]
  onChange: Dispatch<SetStateAction<MediaReference[]>>
  projectId: string | null
  sceneId: string | null
  onBusy: (busy: boolean) => void
  disabled?: boolean
}) {
  const picker = useRef<HTMLInputElement>(null)
  const selection = useRef<{ type: MediaReference["mediaType"]; replaceId?: string }>({ type: "image" })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({})
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const setAnalysisError = (id: string, message: string) => setAnalysisErrors((current) => ({ ...current, [id]: message }))
  useEffect(() => { onBusy(Boolean(busy)); return () => onBusy(false) }, [busy, onBusy])
  const update = (id: string, change: Partial<MediaReference>, invalidateAnalysis = false) => {
    setError("")
    onChange((current) => current.map((item) => item.id === id ? { ...item, ...change, applied: false, ...(invalidateAnalysis ? { analysis: undefined, analysisUnavailable: false } : {}) } : item))
    if (invalidateAnalysis) setAnalysisErrors((current) => { const next = { ...current }; delete next[id]; return next })
  }
  function pick(type: MediaReference["mediaType"], replaceId?: string) {
    selection.current = { type, replaceId }
    if (picker.current) {
      picker.current.accept = REFERENCE_MIME_TYPES[type].join(",")
      picker.current.multiple = !replaceId
      picker.current.value = ""
      picker.current.click()
    }
  }
  async function upload(selected: File[]) {
    let files = selected
    if (!files.length) return
    const { type, replaceId } = selection.current
    const room = MAX_REFERENCES - references.length + (replaceId ? 1 : 0)
    if (room <= 0) { setError(`All ${MAX_REFERENCES} slots are full. Remove a reference to free one.`); return }
    const duplicates = files.filter((file) => references.some((ref) => ref.id !== replaceId && ref.name === file.name.slice(0, 180) && (!ref.bytes || ref.bytes === file.size)))
    const fresh = files.filter((file) => !duplicates.includes(file))
    const accepted = fresh.slice(0, room)
    const notices = [
      duplicates.length ? `${duplicates.length === 1 ? `${duplicates[0].name} is` : `${duplicates.length} files are`} already added.` : "",
      fresh.length > room ? `Only ${room} more ${room === 1 ? "slot was" : "slots were"} free, so ${fresh.length - room} ${fresh.length - room === 1 ? "file was" : "files were"} not added.` : "",
    ].filter(Boolean).join(" ")
    if (!accepted.length) { setError(notices || "Nothing to add."); return }
    files = accepted
    setBusy("upload")
    setUploadProgress({ done: 0, total: files.length })
    setError("")
    try {
      const db = createClient()
      const { data: { user } } = await db.auth.getUser()
      if (!user) throw new Error("Please sign in to upload references.")
      for (const file of files) {
        if (!(REFERENCE_MIME_TYPES[type] as readonly string[]).includes(file.type)) throw new Error("Unsupported format. Use JPG/PNG/WebP, MP4/WebM/MOV, or MP3/M4A/WAV.")
        if (file.size > MAX_REFERENCE_BYTES || file.size === 0) throw new Error("Each file must be non-empty and no larger than 25 MB.")
        const duration = type === "image" ? undefined : await getDuration(file, type)
        const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "audio/webm": "webm", "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/wav": "wav", "audio/x-wav": "wav" } as Record<string, string>)[file.type]
        const assetPath = `${user.id}/${crypto.randomUUID()}.${ext}`
        // One automatic retry covers a dropped connection before asking the creator.
        let { error: uploadError } = await db.storage.from(REFERENCE_BUCKET).upload(assetPath, file, { contentType: file.type, upsert: false })
        if (uploadError) ({ error: uploadError } = await db.storage.from(REFERENCE_BUCKET).upload(assetPath, file, { contentType: file.type, upsert: true }))
        if (uploadError) throw new Error(`${file.name} didn't upload. Check your connection and try again.`)
        const previous = references.find((ref) => ref.id === replaceId)
        const ref: MediaReference = {
          id: previous?.id || crypto.randomUUID(), assetPath, name: file.name.slice(0, 180), mediaType: type,
          role: previous?.role || REFERENCE_ROLES[type][0], ...(previous?.roles ? { roles: previous.roles } : {}),
          mimeType: file.type, bytes: file.size, createdAt: new Date().toISOString(), priority: previous?.priority || "secondary",
          influence: previous?.influence || "medium", scope: previous?.scope || "shot", locked: false,
          target: previous?.target || "director", projectId, sceneId, applied: false, duration,
          trimStart: 0, trimEnd: duration ? Math.min(duration, 10) : undefined, volume: previous?.volume ?? 1,
        }
        onChange((current) => previous ? current.map((item) => item.id === previous.id ? ref : item) : [...current, ref])
        setAnalysisErrors((current) => { const next = { ...current }; delete next[ref.id]; return next })
        setExpandedId(ref.id)
        setUploadProgress((current) => current && { ...current, done: current.done + 1 })
      }
      if (notices) setError(notices)
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed") }
    finally { setBusy(null); setUploadProgress(null) }
  }
  async function analyse(ref: MediaReference) {
    const validated = mediaReferenceSchema.safeParse(ref)
    if (!validated.success) { setError(validated.error.issues[0]?.message || "Check reference settings"); return }
    setBusy(ref.id)
    setError("")
    onChange((current) => current.map((item) => item.id === ref.id ? { ...item, analysisUnavailable: false } : item))
    try {
      const result = await fetch("/api/media/references/analyse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: { ...ref, analysis: undefined }, peers: references.filter((item) => item.id !== ref.id && item.applied && item.analysis).map((item) => ({ role: referenceRoles(item).join(" + ").slice(0, 32), guidance: item.analysis!.guidance })) }), signal: AbortSignal.timeout(175000) })
      const body = await result.json()
      if (!result.ok) throw new Error(body.error || "Analysis failed")
      update(ref.id, { analysis: referenceAnalysisSchema.parse(body.analysis), analysisUnavailable: false })
      setAnalysisErrors((current) => { const next = { ...current }; delete next[ref.id]; return next })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analysis failed"
      onChange((current) => current.map((item) => item.id === ref.id ? { ...item, analysisUnavailable: true } : item))
      setError("")
      setAnalysisError(ref.id, message)
    }
    finally { setBusy(null) }
  }
  function apply(ref: MediaReference) {
    const result = mediaReferenceSchema.safeParse({ ...ref, applied: true })
    if (!result.success) { setError(result.error.issues[0]?.message || "Check reference settings"); return }
    const next = references.map((item) => item.id === ref.id ? result.data : item)
    const issues = referenceCompatibility(next)
    if (issues.length) { setError(issues.join(" ")); return }
    setError("")
    onChange((current) => current.map((item) => item.id === ref.id ? result.data : item))
  }
  function unapply(ref: MediaReference) {
    setError("")
    onChange((current) => current.map((item) => item.id === ref.id ? { ...item, applied: false } : item))
  }
  /** Analysis is optional: attach the reference as-is. An unanalysed image only
   *  reaches the video when it is the starting frame, so take that slot if free. */
  function continueWithoutAnalysis(ref: MediaReference) {
    apply({ ...ref, target: continueWithoutAnalysisTarget(ref, references) })
  }
  const warnings = [...referenceCompatibility(references), ...referenceConflicts(references)]
  const labelled = labelReferences(references)
  const full = references.length >= MAX_REFERENCES
  const appliedCount = references.filter((ref) => ref.applied).length
  return <section className={styles.manager} aria-label="Media references">
    <div className={styles.header}><h3>Media references</h3><span className={styles.count} aria-live="polite">{appliedCount} applied / {references.length} added</span></div>
    <p className={styles.hint}>Give each reference one job. Review the direction, then apply it to your next shot.</p>
    <div className={styles.toolbar}>
      <button type="button" disabled={disabled || !!busy || full} onClick={() => pick("image")}><ImagePlus size={14} /> Add Image</button>
      <button type="button" disabled={disabled || !!busy || full} onClick={() => pick("video")}><Film size={14} /> Add Video</button>
      <button type="button" disabled={disabled || !!busy || full} onClick={() => pick("audio")}><AudioLines size={14} /> Add Audio</button>
    </div>
    <input ref={picker} type="file" hidden aria-label="Upload media references" onChange={(event) => void upload(Array.from(event.target.files || []))} />
    {full && <p className={styles.hint} role="status">All {MAX_REFERENCES} slots are in use. Remove a reference to add another.</p>}
    {busy === "upload" && <p className={styles.hint} role="status">{uploadProgress && uploadProgress.total > 1 ? `Uploading ${Math.min(uploadProgress.done + 1, uploadProgress.total)} of ${uploadProgress.total}…` : "Uploading to your private reference library…"}</p>}
    {error && <p className={styles.warning} role="alert">{error}</p>}
    {warnings.map((warning) => <p key={warning} className={styles.warning}>{warning}</p>)}
    {!references.length && <div className={styles.empty}>Identity. Movement. Sound.<br /><span className={styles.hint}>Up to {MAX_REFERENCES} references, 25 MB each. Give each one a job (character, wardrobe, location…); only applied references are used.</span></div>}
    {labelled.map((ref) => {
      const analysisError = analysisErrors[ref.id]
      const hasManualGuidance = Boolean(ref.manualGuidance?.trim())
      const canUseImageDirectly = ref.mediaType === "image" && ref.target === "provider"
      const applyLabel = ref.applied ? "Applied" : ref.analysis ? "Apply Reference" : hasManualGuidance ? "Apply manual direction" : canUseImageDirectly ? "Use image directly" : "Continue without analysis"
      const continueHint = ref.mediaType === "image"
        ? continueWithoutAnalysisTarget(ref, references) === "provider" ? "It will be used directly as the starting frame." : "It stays attached as a labelled reference; the starting frame is already taken."
        : "Your written prompt leads; the file stays attached."
      return <details className={styles.card} key={ref.id} open={expandedId === ref.id}>
      <summary onClick={(event) => { event.preventDefault(); setExpandedId(expandedId === ref.id ? null : ref.id) }}><ReferenceThumb reference={ref} /><div className={styles.title}><strong><span className={styles.tag}>{ref.label}</span>{ref.name}</strong><span>{referenceRoles(ref).join(" + ")} · {ref.scope}{ref.locked ? " · locked" : ""}</span></div><span className={styles.badge}>{ref.applied ? "Applied" : ref.analysis ? "Ready to apply" : ref.analysisUnavailable || analysisError ? "Analysis unavailable" : "Analysis optional"}</span><ChevronDown size={12} /></summary>
      <div className={styles.body}>
        <ReferencePreview reference={ref} />
        {(ref.analysisUnavailable || analysisError) && !ref.applied && <div className={styles.warning} role="status">
          <p>Analysis unavailable — you can keep going. {continueHint}{analysisError ? <span className={styles.detail}> ({analysisError})</span> : null}</p>
          <div className={styles.inlineActions}>
            <button type="button" className={styles.apply} disabled={disabled || !!busy || ref.locked} onClick={() => continueWithoutAnalysis(ref)}>Continue without analysis</button>
            <button type="button" disabled={disabled || !!busy || ref.locked} onClick={() => void analyse(ref)}>{busy === ref.id && <Loader2 size={12} className="animate-spin" />}Retry analysis</button>
          </div>
        </div>}
        <div className={styles.grid}>
          <div className={`${styles.field} ${styles.full}`}>Roles<RolePicker reference={ref} disabled={disabled || !!busy || ref.locked} onChange={(roles) => { const next = withRoles(ref, roles); update(ref.id, { roles: next.roles, role: next.role }, true) }} /></div>
          <label className={styles.field}>Use for<select disabled={disabled || !!busy || ref.locked} value={ref.target} onChange={(e) => update(ref.id, { target: e.target.value as MediaReference["target"] })}><option value="director">Director guidance</option><option value="provider" disabled={ref.mediaType !== "image"}>Direct image-to-video</option></select></label>
          <label className={styles.field}>Priority<select disabled={disabled || !!busy || ref.locked} value={ref.priority} onChange={(e) => update(ref.id, { priority: e.target.value as MediaReference["priority"] })}>{["primary", "secondary", "supporting"].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className={styles.field}>Influence<select disabled={disabled || !!busy || ref.locked} value={ref.influence} onChange={(e) => update(ref.id, { influence: e.target.value as MediaReference["influence"] })}>{["low", "medium", "high"].map((v) => <option key={v}>{v}</option>)}</select></label>
          <label className={`${styles.field} ${styles.full}`}>Scope<select disabled={disabled || !!busy || ref.locked} value={ref.scope} onChange={(e) => update(ref.id, { scope: e.target.value as MediaReference["scope"], projectId, sceneId })}><option value="shot">This shot / retries</option><option value="scene" disabled={!sceneId}>This scene</option><option value="project" disabled={!projectId}>This project</option></select></label>
          {ref.mediaType !== "image" && <>
            <label className={styles.field}>Trim start (seconds)<input type="number" min="0" max={ref.duration} step="0.1" disabled={disabled || !!busy || ref.locked} value={ref.trimStart} onChange={(e) => update(ref.id, { trimStart: Number(e.target.value) }, true)} /></label>
            <label className={styles.field}>Trim end (seconds)<input type="number" min="0.1" max={ref.duration} step="0.1" disabled={disabled || !!busy || ref.locked} value={ref.trimEnd ?? ""} onChange={(e) => update(ref.id, { trimEnd: Number(e.target.value) }, true)} /></label>
            <p className={`${styles.hint} ${styles.full}`}>Duration: {ref.duration?.toFixed(1)}s. Analyse a section up to 30s.</p>
            <label className={`${styles.field} ${styles.full}`}>Preview volume ({Math.round(ref.volume * 100)}%)<input type="range" min="0" max="1" step="0.05" disabled={disabled || !!busy || ref.locked} value={ref.volume} onChange={(e) => update(ref.id, { volume: Number(e.target.value) })} /></label>
          </>}
        </div>
        {ref.target === "provider" && <p className={styles.warning}>One image is passed as the starting frame. Its entire composition may influence the result; role isolation and influence strength are not provider controls.</p>}
        {ref.mediaType === "audio" && <p className={styles.hint}>Speech roles use transcription. Music, effects, ambience and timing are listened to for sound and rhythm cues, not precise beat mapping or lip-sync.</p>}
        {ref.analysis && <div className={styles.analysis}>
          <label className={styles.field}>Direction to approve<textarea rows={3} maxLength={240} disabled={disabled || !!busy || ref.locked} value={ref.analysis.guidance} onChange={(e) => update(ref.id, { analysis: { ...ref.analysis!, guidance: e.target.value } })} /></label>
          <ul>{ref.analysis.observations.map((observation, i) => <li key={i}>{observation}</li>)}</ul>
          {ref.analysis.warnings.map((warning, i) => <p className={styles.warning} key={i}>{warning}</p>)}
          <p className={styles.hint}>{ref.analysis.limitations}</p>
          {ref.analysis.transcript && <details><summary>Speech transcript</summary><p>{ref.analysis.transcript}</p></details>}
        </div>}
        {!ref.analysis && <div className={styles.analysis}>
          <label className={styles.field}>Manual direction (used without analysis)<textarea rows={3} maxLength={500} disabled={disabled || !!busy || ref.locked} value={ref.manualGuidance || ""} placeholder={ref.mediaType === "audio" ? "Describe the intended voice, dialogue, mood, or timing. The audio itself will not be mixed or synced." : ref.mediaType === "video" ? "Describe the movement, framing, or pacing you want the crew to use." : "Describe what the image should guide."} onChange={(e) => update(ref.id, { manualGuidance: e.target.value })} /></label>
          <p className={styles.hint}>{ref.mediaType === "audio" ? "Audio stays attached as a reference; add the spoken words or sound cues here if they matter to the shot." : ref.mediaType === "video" ? "The video stays attached, but this adapter uses written motion direction unless analysis is available." : "You can also use an image directly as the starting frame by choosing Direct image-to-video above."}</p>
        </div>}
        <div className={styles.actions}>
          <button type="button" disabled={disabled || !!busy || ref.locked} onClick={() => void analyse(ref)}>{busy === ref.id && <Loader2 size={12} className="animate-spin" />}{ref.analysis ? "Re-analyse" : ref.analysisUnavailable || analysisError ? "Retry analysis" : "Analyse"}</button>
          {ref.applied
            ? <button type="button" className={styles.applied} aria-pressed disabled={disabled || !!busy || ref.locked} onClick={() => unapply(ref)} title="Applied to your next shot. Tap to stop using it."><Check size={12} />Applied</button>
            : <button type="button" className={styles.apply} disabled={disabled || !!busy} onClick={() => ref.analysis || hasManualGuidance ? apply(ref) : continueWithoutAnalysis(ref)}>{applyLabel}</button>}
          <button type="button" disabled={disabled || !!busy} aria-pressed={ref.locked} onClick={() => update(ref.id, { locked: !ref.locked })}><LockKeyhole size={12} />{ref.locked ? "Unlock" : "Lock"}</button>
          <button type="button" disabled={disabled || !!busy || ref.locked} onClick={() => pick(ref.mediaType, ref.id)}>Replace</button>
          <button type="button" className={styles.remove} disabled={disabled || !!busy || ref.locked} onClick={() => onChange((current) => current.filter((item) => item.id !== ref.id))}>Remove</button>
        </div>
      </div>
    </details>})}
    {references.some((ref) => ref.scope === "shot") && <div className={styles.actions}><button type="button" disabled={disabled || !!busy} onClick={() => {
      if (window.confirm("Start a new reference setup? Shot-only references will detach, including shot locks. Scene and project references stay. Stored assets and saved takes are unchanged.")) onChange((current) => current.filter((ref) => ref.scope !== "shot"))
    }}>Start next shot setup</button></div>}
    <p className={`${styles.hint} ${styles.footer}`}>Influence is a director instruction, not a guaranteed model strength. Audio is not mixed into output. Detaching keeps the stored file. Locks protect settings, not pixel-perfect results.</p>
  </section>
}
