export function trimPromptBySegments(parts: string[], limit: number): string {
  if (limit < 32) throw new Error("Prompt limit is too small.")

  const kept: string[] = []
  for (const [index, part] of parts.entries()) {
    if (index === 0 && part.length > limit) {
      const reserved = Math.min(180, Math.floor(limit * 0.2))
      const candidate = part.slice(0, limit - reserved).trimEnd()
      const boundary = candidate.lastIndexOf(" ")
      kept.push(`${(boundary > candidate.length * 0.6 ? candidate.slice(0, boundary) : candidate).trimEnd()}...`)
      continue
    }

    const candidate = [...kept, part].join(", ")
    // Optional context must not prevent later duration/aspect directives from fitting.
    if (candidate.length > limit) continue
    kept.push(part)
  }

  return kept.join(", ")
}
