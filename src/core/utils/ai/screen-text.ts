/**
 * Video models tend to paint quoted words (lyrics, dialogue, transcripts) onto the frame as captions,
 * and they cannot spell, so the result is gibberish text. Unless the creator explicitly asks for
 * on-screen text, every video prompt says words are heard, never written, and the negative prompt
 * names captions and subtitles.
 */
const ASKS_FOR_TEXT = /\b(title card|on[- ]screen text|text (?:that )?reads|caption(?:s|ed)?|subtitle(?:s|d)?|lower third|kinetic (?:type|typography)|lyric video|sign (?:that )?reads|neon sign reading|written on|typography)\b/i

export function wantsOnScreenText(text: string): boolean {
  // "no captions" / "without subtitles" is a request for NO text.
  const cleaned = text.replace(/\b(no|without|avoid|never)\s+(on[- ]screen text|captions?|subtitles?|text)\b/gi, "")
  return ASKS_FOR_TEXT.test(cleaned)
}

// Says nothing about voices: "spoken words are heard" made models invent speech nobody's mouth matched.
export const NO_SCREEN_TEXT_DIRECTIVE =
  "No on-screen text, subtitles, captions or lyrics are ever written in the frame"

export const SCREEN_TEXT_NEGATIVES = ["subtitles", "captions", "on-screen text", "written lyrics", "typography", "letters", "watermark"]

/** Natural speech runs about 2.5 words a second; past ~2.8 the model rushes or drops the sync. */
const WORDS_PER_SECOND = 2.8
const SPEECH_VERBS = /\b(sings?|singing|sang|speaks?|speaking|talks?|talking|says|said|saying|shouts?|whispers?|raps?|rapping|narrat\w*|dialogue|monologue|lyrics?|lip[- ]?syncs?|voice[- ]?over|tells? (?:him|her|them))\b/i

/** Quoted lines the creator wants heard (straight or curly quotes, at least two words). */
export function spokenLines(text: string): string[] {
  return [...text.matchAll(/["\u201c]([^"\u201c\u201d]{3,}?)["\u201d]/g)].map((match) => match[1].trim()).filter((line) => line.split(/\s+/).length >= 2)
}

/** Whether the spoken lines fit the clip; long lines get rushed and fall out of sync. */
export function speechFit(text: string, seconds: number): { words: number; maxWords: number; fits: boolean } {
  const words = spokenLines(text).join(" ").split(/\s+/).filter(Boolean).length
  const maxWords = Math.floor(seconds * WORDS_PER_SECOND)
  return { words, maxWords, fits: words <= maxWords }
}

/**
 * Tells a video model that makes its own audio (Kling 3.0, Seedance 2.5) who talks. With lines or a
 * speaking verb, only the speaker's lips move, in time with each word. Without them, nobody speaks,
 * so no voice is invented that no mouth matches.
 */
export function speechDirective(text: string, seconds?: number): string {
  const lines = spokenLines(text)
  if (lines.length || SPEECH_VERBS.test(text)) {
    const pace = seconds && lines.length && !speechFit(text, seconds).fits ? ", spoken briskly but clearly so every line finishes inside the clip" : ""
    return `Lip-sync: only the character who is speaking or singing moves their lips, mouth shapes match every word in time with the voice, one voice at a time, no other voices${pace}`
  }
  return "No dialogue: nobody speaks or sings and mouths stay closed; natural ambient sound only"
}

/** Adds the no-text and speech rules to a finished prompt (for paths that do not assemble their own parts). */
export function withNoScreenText(prompt: string, seconds?: number): string {
  if (prompt.includes(NO_SCREEN_TEXT_DIRECTIVE)) return prompt
  const speech = speechDirective(prompt, seconds)
  const rules = wantsOnScreenText(prompt) ? speech : `${NO_SCREEN_TEXT_DIRECTIVE}. ${speech}`
  return `${prompt.trimEnd().replace(/[.,;]$/, "")}. ${rules}.`
}
