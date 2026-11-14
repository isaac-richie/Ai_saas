function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on"
}

// Open for the public test period. Set NEXT_PUBLIC_STUDIO_ENABLED=false to lock it again.
export const STUDIO_ENABLED = toBool(process.env.NEXT_PUBLIC_STUDIO_ENABLED, true)

// Long Form mandatory image locks (spec v1.2). On by default; set NEXT_PUBLIC_LONG_FORM_LOCKS=false to hide
// the editor and stop new locks being saved. Locks already saved are still enforced at generation.
export const LONG_FORM_LOCKS_ENABLED = toBool(process.env.NEXT_PUBLIC_LONG_FORM_LOCKS, true)

// Long Form locked audio (spec v2.0): upload, AI creation and export enforcement. Set
// NEXT_PUBLIC_LONG_FORM_AUDIO=false to hide audio and stop new audio locks. Saved audio locks are still
// enforced at export, so a film can never export without the recording that was approved for it.
export const LONG_FORM_AUDIO_ENABLED = toBool(process.env.NEXT_PUBLIC_LONG_FORM_AUDIO, true)
// AI-created audio costs provider credits; it can be switched off on its own.
export const LONG_FORM_AI_AUDIO_ENABLED = toBool(process.env.NEXT_PUBLIC_LONG_FORM_AI_AUDIO, true)

// Long Form video references: lock a clip from the film's library to a shot or scene as a real video
// input. Set NEXT_PUBLIC_LONG_FORM_VIDEO_REFS=false to hide the Videos section and stop new references
// being saved. References already saved are still enforced at generation.
export const LONG_FORM_VIDEO_REFS_ENABLED = toBool(process.env.NEXT_PUBLIC_LONG_FORM_VIDEO_REFS, true)

// Mimic (beta): record or upload a performance and transform who or what is in it. Set
// NEXT_PUBLIC_MIMIC=false to hide it and stop new takes.
export const MIMIC_ENABLED = toBool(process.env.NEXT_PUBLIC_MIMIC, true)
// Changing more than one person or object in a single take. Off until it has been proven on the model;
// with it off, a take with several changes is saved but blocked from generating. Set
// NEXT_PUBLIC_MIMIC_MULTI_SUBJECT=true once verified.
export const MIMIC_MULTI_SUBJECT_ENABLED = toBool(process.env.NEXT_PUBLIC_MIMIC_MULTI_SUBJECT, false)
