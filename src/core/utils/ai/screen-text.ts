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

export const NO_SCREEN_TEXT_DIRECTIVE =
  "No on-screen text, subtitles, captions or lyrics: any spoken or sung words are heard only, never written in the frame"

export const SCREEN_TEXT_NEGATIVES = ["subtitles", "captions", "on-screen text", "written lyrics", "typography", "letters", "watermark"]

/** Adds the no-text rule to a finished prompt (for paths that do not assemble their own parts). */
export function withNoScreenText(prompt: string): string {
  if (wantsOnScreenText(prompt) || prompt.includes(NO_SCREEN_TEXT_DIRECTIVE)) return prompt
  return `${prompt.trimEnd().replace(/[.,;]$/, "")}. ${NO_SCREEN_TEXT_DIRECTIVE}.`
}
