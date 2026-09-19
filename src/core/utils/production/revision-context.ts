type Finding = { shotNumber: number; severity: "note" | "blocking"; evidence: string; correction: string }

export function buildRevisionContext(previous: unknown, direction: string, findings: Finding[]) {
  const cleanDirection = direction.trim()
  const uniqueFindings = findings.filter((finding, index, all) => all.findIndex(candidate =>
    candidate.shotNumber === finding.shotNumber
    && candidate.severity === finding.severity
    && candidate.evidence === finding.evidence
    && candidate.correction === finding.correction
  ) === index)
  // A revision is a fresh repair brief. Old directions describe superseded drafts.
  return { revision: { directions: cleanDirection ? [cleanDirection] : [], findings: uniqueFindings } }
}

export function compactRevisionContext(value: unknown) {
  if (!value || typeof value !== "object") return null
  const revision = (value as { revision?: unknown }).revision
  if (!revision || typeof revision !== "object") return null
  const source = revision as { directions?: unknown; findings?: unknown }
  const directions = Array.isArray(source.directions)
    ? source.directions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(-1)
    : []
  const findings = Array.isArray(source.findings)
    ? source.findings.filter((item): item is Finding => {
      if (!item || typeof item !== "object") return false
      const finding = item as Partial<Finding>
      return Number.isInteger(finding.shotNumber)
        && (finding.severity === "blocking" || finding.severity === "note")
        && typeof finding.evidence === "string"
        && typeof finding.correction === "string"
    }).slice(0, 8).map(finding => ({
      ...finding,
      evidence: finding.evidence.slice(0, 420),
      correction: finding.correction.slice(0, 420),
    }))
    : []
  return { directions, findings }
}

export function revisionSaveError(code?: string) {
  if (code === "23505") return "Another revision was created at the same time. Refresh and retry."
  if (code === "23514") return "The revised production failed a database validation rule. Your saved film is unchanged."
  if (code === "42501") return "You do not have permission to revise this production. Please sign in again."
  if (code === "42703" || code === "PGRST204") return "Production revision storage is incomplete. Apply migrations 0024 and 0025."
  return "Could not save the revised production. Your saved film is unchanged. Please retry."
}
