/**
 * Re-planning chosen shots only (Keep Progress Step 4). The crew rewrites just those shots; every
 * other shot keeps its plan, prompt and timing exactly, and is shown to the crew only as fixed
 * context so the handoffs into and out of the re-planned shots still line up.
 */

/** The shots to re-plan: whole numbers within the film, each once, in film order. Empty when invalid. */
export function normalizeShotScope(shotNumbers: readonly number[] | undefined | null, total: number): number[] {
  if (!shotNumbers?.length || !Number.isInteger(total) || total < 1) return []
  const chosen = [...new Set(shotNumbers)].sort((a, b) => a - b)
  return chosen.every((n) => Number.isInteger(n) && n >= 1 && n <= total) ? chosen : []
}

/** Re-planning every shot is a whole-film re-plan, not a scoped one. */
export function isWholeFilm(chosen: readonly number[], total: number): boolean {
  return chosen.length === 0 || chosen.length >= total
}

type Numbered<T> = T & { shotNumber: number }

/** What the crew sees: the shots it may change, and the neighbours it must connect to but not change. */
export function replanContext<T>(previous: readonly T[], chosen: readonly number[]): {
  shotsToReplan: Numbered<T>[]
  readOnlyNeighbours: Numbered<T>[]
} {
  const picked = new Set(chosen)
  const neighbours = new Set<number>()
  for (const n of chosen) {
    if (n > 1 && !picked.has(n - 1)) neighbours.add(n - 1)
    if (n < previous.length && !picked.has(n + 1)) neighbours.add(n + 1)
  }
  const numbered = (n: number) => ({ ...previous[n - 1], shotNumber: n }) as Numbered<T>
  return {
    shotsToReplan: chosen.map(numbered),
    readOnlyNeighbours: [...neighbours].sort((a, b) => a - b).map(numbered),
  }
}

/** The film's shots with only the chosen ones replaced, in order. Anything else is a mistake and throws. */
export function spliceReplannedShots<T>(previous: readonly T[], chosen: readonly number[], rewritten: readonly T[]): T[] {
  if (rewritten.length !== chosen.length) throw new Error(`The crew returned ${rewritten.length} shots for ${chosen.length} to re-plan. Retry this stage.`)
  const replacement = new Map(chosen.map((n, i) => [n, rewritten[i]]))
  return previous.map((shot, index) => replacement.get(index + 1) ?? shot)
}

/** The shot editor's brief for a scoped re-plan. */
export function replanInstruction(chosen: readonly number[], total: number): string {
  const list = chosen.length === 1 ? `shot ${chosen[0]}` : `shots ${chosen.join(", ")}`
  return [
    `Re-plan only ${list} of this ${total}-shot film. Apply the revision direction to ${chosen.length === 1 ? "this shot" : "these shots"} only.`,
    `Return exactly ${chosen.length} shot${chosen.length === 1 ? "" : "s"}, in the order listed in shotsToReplan, one for each.`,
    "Every other shot in the film is fixed and is not yours to change. readOnlyNeighbours shows the shots directly before and after: a re-planned shot must begin at the preceding shot's endState and end in a state the following shot's startState can begin from. If the direction makes that impossible, keep the handoff as close as you can and say so in editNote.",
    "Keep the bible's continuity, each shot's place in the story, and the model and duration given in shotSettings (listed for the re-planned shots only, in the same order).",
    "Write complete fields with complete timed action, camera direction, continuity startState, endState, carriedDetails and intentionalChanges, exactly as for a full plan.",
  ].join(" ")
}
