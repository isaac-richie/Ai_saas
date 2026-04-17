type GenerationOutput = "image" | "video"

type PromptComplianceInput = {
  prompt: string
  negativePrompt?: string
  outputType: GenerationOutput
}

export type PromptComplianceResult = {
  prompt: string
  negativePrompt: string
  blocked: boolean
  reason?: string
  flags: string[]
}

const SAFETY_NEGATIVE_BASE = [
  "graphic gore",
  "explicit nudity",
  "sexual content",
  "minor-looking person",
  "self-harm depiction",
  "extremist symbols",
]

const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?(policy|policies|rules|guidelines)/gi,
  /bypass\s+(safety|policy|moderation|filters?)/gi,
  /uncensored|unfiltered|nsfw|jailbreak/gi,
]

const GRAPHIC_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string; flag: string }> = [
  { pattern: /\bgore\b/gi, replacement: "non-graphic action aftermath", flag: "graphic_gore" },
  { pattern: /\bblood splatter\b/gi, replacement: "non-graphic impact details", flag: "graphic_gore" },
  { pattern: /\bdecapitat(e|ion)\b/gi, replacement: "off-screen impact", flag: "graphic_violence" },
  { pattern: /\bdismember(ment)?\b/gi, replacement: "off-screen damage implication", flag: "graphic_violence" },
  { pattern: /\bexposed organs?\b/gi, replacement: "non-graphic injury implication", flag: "graphic_violence" },
  { pattern: /\bsexual intercourse\b/gi, replacement: "romantic closeness", flag: "explicit_sexual" },
  { pattern: /\bexplicit nudity\b/gi, replacement: "fully clothed subject", flag: "explicit_nudity" },
]

const SEXUAL_TERMS = /\b(sex|sexual|nude|nudity|porn|erotic)\b/i
const MINOR_TERMS = /\b(child|children|kid|teen|young girl|young boy|underage|minor)\b/i

const normalize = (value: string) => value.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim()

function dedupeCsv(input: string): string {
  const parts = input
    .split(",")
    .map((part) => normalize(part).toLowerCase())
    .filter(Boolean)

  const seen = new Set<string>()
  const unique: string[] = []

  for (const part of parts) {
    if (seen.has(part)) continue
    seen.add(part)
    unique.push(part)
  }

  return unique.join(", ")
}

export function enforcePromptCompliance(input: PromptComplianceInput): PromptComplianceResult {
  const flags: string[] = []
  let prompt = normalize(input.prompt || "")
  let negative = normalize(input.negativePrompt || "")

  if (!prompt) {
    prompt = input.outputType === "video" ? "cinematic scene with coherent motion" : "cinematic scene with clean composition"
    flags.push("prompt_was_empty")
  }

  for (const pattern of JAILBREAK_PATTERNS) {
    if (pattern.test(prompt)) {
      flags.push("policy_bypass_language")
      prompt = prompt.replace(pattern, "")
    }
  }

  if (SEXUAL_TERMS.test(prompt) && MINOR_TERMS.test(prompt)) {
    return {
      prompt,
      negativePrompt: dedupeCsv([negative, ...SAFETY_NEGATIVE_BASE].filter(Boolean).join(", ")),
      blocked: true,
      reason: "Prompt contains a high-risk combination (sexual + minor terms). Please rewrite with clearly adult, non-explicit content.",
      flags: [...flags, "sexual_minor_combination"],
    }
  }

  for (const { pattern, replacement, flag } of GRAPHIC_REPLACEMENTS) {
    if (pattern.test(prompt)) {
      prompt = prompt.replace(pattern, replacement)
      flags.push(flag)
    }
  }

  prompt = normalize(prompt.replace(/\s*,\s*,+/g, ", ").replace(/^,+|,+$/g, ""))
  if (!prompt) {
    prompt = "cinematic scene with compliant non-graphic content"
    flags.push("prompt_rebuilt_after_sanitization")
  }

  negative = dedupeCsv([negative, ...SAFETY_NEGATIVE_BASE].filter(Boolean).join(", "))

  return {
    prompt,
    negativePrompt: negative,
    blocked: false,
    flags,
  }
}
