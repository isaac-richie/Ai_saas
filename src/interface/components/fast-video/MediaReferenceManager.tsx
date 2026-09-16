"use client"

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { ImagePlus, Film, AudioLines, LockKeyhole, ChevronDown, Loader2 } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { MAX_REFERENCE_BYTES, REFERENCE_BUCKET, REFERENCE_MIME_TYPES, REFERENCE_ROLES, mediaReferenceSchema, referenceAnalysisSchema, referenceCompatibility, referenceConflicts, type MediaReference } from "@/core/validation/media-reference"
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
  useEffect(() => { onBusy(Boolean(busy)); return () => onBusy(false) }, [busy, onBusy])
  const update = (id: string, change: Partial<MediaReference>, invalidateAnalysis = false) => {
    setError("")
    onChange((current) => current.map((item) => item.id === id ? { ...item, ...change, applied: false, ...(invalidateAnalysis ? { analysis: undefined } : {}) } : item))
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
  async function upload(files: File[]) {
    if (!files.length) return
    const { type, replaceId } = selection.current
    if (files.length + references.length - (replaceId ? 1 : 0) > 6) { setError("Use up to six references in this context."); return }
    setBusy("upload")
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
        const { error: uploadError } = await db.storage.from(REFERENCE_BUCKET).upload(assetPath, file, { contentType: file.type, upsert: false })
        if (uploadError) throw new Error("Upload failed. Ensure migration 0027 is applied and your session is active.")
        const previous = references.find((ref) => ref.id === replaceId)
        const ref: MediaReference = {
          id: previous?.id || crypto.randomUUID(), assetPath, name: file.name.slice(0, 180), mediaType: type,
          role: previous?.role || REFERENCE_ROLES[type][0], priority: previous?.priority || "secondary",
          influence: previous?.influence || "medium", scope: previous?.scope || "shot", locked: false,
          target: previous?.target || "director", projectId, sceneId, applied: false, duration,
          trimStart: 0, trimEnd: duration ? Math.min(duration, 10) : undefined, volume: previous?.volume ?? 1,
        }
        onChange((current) => previous ? current.map((item) => item.id === previous.id ? ref : item) : [...current, ref])
        setExpandedId(ref.id)
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed") }
    finally { setBusy(null) }
  }
  async function analyse(ref: MediaReference) {
    const validated = mediaReferenceSchema.safeParse(ref)
    if (!validated.success) { setError(validated.error.issues[0]?.message || "Check reference settings"); return }
    setBusy(ref.id)
    setError("")
    try {
      const result = await fetch("/api/media/references/analyse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference: { ...ref, analysis: undefined }, peers: references.filter((item) => item.id !== ref.id && item.applied && item.analysis).map((item) => ({ role: item.role, guidance: item.analysis!.guidance })) }), signal: AbortSignal.timeout(175000) })
      const body = await result.json()
      if (!result.ok) throw new Error(body.error || "Analysis failed")
      update(ref.id, { analysis: referenceAnalysisSchema.parse(body.analysis) })
    } catch (err) { setError(err instanceof Error ? err.message : "Analysis failed") }
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
  const warnings = [...referenceCompatibility(references), ...referenceConflicts(references)]
  return <section className={styles.manager} aria-label="Media references">
    <div className={styles.header}><h3>Media references</h3><span className={styles.count}>{references.filter((ref) => ref.applied).length} applied / {references.length} added</span></div>
    <p className={styles.hint}>Give each reference one job. Review the direction, then apply it to your next shot.</p>
    <div className={styles.toolbar}>
      <button type="button" disabled={disabled || !!busy || references.length >= 6} onClick={() => pick("image")}><ImagePlus size={14} /> Add Image</button>
      <button type="button" disabled={disabled || !!busy || references.length >= 6} onClick={() => pick("video")}><Film size={14} /> Add Video</button>
      <button type="button" disabled={disabled || !!busy || references.length >= 6} onClick={() => pick("audio")}><AudioLines size={14} /> Add Audio</button>
    </div>
    <input ref={picker} type="file" hidden aria-label="Upload media references" onChange={(event) => void upload(Array.from(event.target.files || []))} />
    {busy === "upload" && <p className={styles.hint} role="status">Uploading to your private reference library...</p>}
    {error && <p className={styles.warning} role="alert">{error}</p>}
    {warnings.map((warning) => <p key={warning} className={styles.warning}>{warning}</p>)}
    {!references.length && <div className={styles.empty}>Identity. Movement. Sound.<br /><span className={styles.hint}>Up to 6 references, 25 MB each. Only applied references are used.</span></div>}
    {references.map((ref) => <details className={styles.card} key={ref.id} open={expandedId === ref.id}>
      <summary onClick={(event) => { event.preventDefault(); setExpandedId(expandedId === ref.id ? null : ref.id) }}><span>{ref.mediaType === "image" ? <ImagePlus size={16} /> : ref.mediaType === "video" ? <Film size={16} /> : <AudioLines size={16} />}</span><div className={styles.title}><strong>{ref.name}</strong><span>{ref.role} / {ref.scope}{ref.locked ? " / locked" : ""}</span></div><span className={styles.badge}>{ref.applied ? "Applied" : "Review"}</span><ChevronDown size={12} /></summary>
      <div className={styles.body}>
        <ReferencePreview reference={ref} />
        <div className={styles.grid}>
          <label className={styles.field}>Role<select disabled={disabled || !!busy || ref.locked} value={ref.role} onChange={(e) => update(ref.id, { role: e.target.value }, true)}>{REFERENCE_ROLES[ref.mediaType].map((role) => <option key={role}>{role}</option>)}</select></label>
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
        <div className={styles.actions}>
          <button type="button" disabled={disabled || !!busy || ref.locked} onClick={() => void analyse(ref)}>{busy === ref.id && <Loader2 size={12} className="animate-spin" />}{ref.analysis ? "Re-analyse" : "Analyse"}</button>
          <button type="button" className={styles.apply} disabled={disabled || !!busy || ref.applied} onClick={() => apply(ref)}>{ref.applied ? "Applied" : "Apply Reference"}</button>
          <button type="button" disabled={disabled || !!busy} aria-pressed={ref.locked} onClick={() => update(ref.id, { locked: !ref.locked })}><LockKeyhole size={12} />{ref.locked ? "Unlock" : "Lock"}</button>
          <button type="button" disabled={disabled || !!busy || ref.locked} onClick={() => pick(ref.mediaType, ref.id)}>Replace</button>
          <button type="button" className={styles.remove} disabled={disabled || !!busy || ref.locked} onClick={() => onChange((current) => current.filter((item) => item.id !== ref.id))}>Remove</button>
        </div>
      </div>
    </details>)}
    {references.some((ref) => ref.scope === "shot") && <div className={styles.actions}><button type="button" disabled={disabled || !!busy} onClick={() => {
      if (window.confirm("Start a new reference setup? Shot-only references will detach, including shot locks. Scene and project references stay. Stored assets and saved takes are unchanged.")) onChange((current) => current.filter((ref) => ref.scope !== "shot"))
    }}>Start next shot setup</button></div>}
    <p className={`${styles.hint} ${styles.footer}`}>Influence is a director instruction, not a guaranteed model strength. Audio is not mixed into output. Detaching keeps the stored file. Locks protect settings, not pixel-perfect results.</p>
  </section>
}
