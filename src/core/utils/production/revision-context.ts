type Finding = { shotNumber: number; severity: "note" | "blocking"; evidence: string; correction: string }

export function buildRevisionContext(previous: unknown, direction: string, findings: Finding[]) {
  const context = previous && typeof previous === "object" ? previous as Record<string, unknown> : {}
  const revision = context.revision && typeof context.revision === "object" ? context.revision as Record<string, unknown> : {}
  const directions = Array.isArray(revision.directions)
    ? revision.directions.filter((value): value is string => typeof value === "string")
    : []
  // Keep creative direction, but replace obsolete findings and never copy stage checkpoints.
  return { revision: { directions: [...new Set([...directions, direction])], findings } }
}

export function revisionSaveError(code?: string) {
  if (code === "23505") return "Another revision was created at the same time. Refresh and retry."
  if (code === "23514") return "The revised production failed a database validation rule. Your saved film is unchanged."
  if (code === "42501") return "You do not have permission to revise this production. Please sign in again."
  if (code === "42703" || code === "PGRST204") return "Production revision storage is incomplete. Apply migrations 0024 and 0025."
  return "Could not save the revised production. Your saved film is unchanged. Please retry."
}
