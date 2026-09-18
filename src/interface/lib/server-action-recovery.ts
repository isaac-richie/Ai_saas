const RECOVERY_KEY = "visiowave.server-action-recovery"
const RECOVERY_COOLDOWN_MS = 30_000

function errorText(error: unknown): string {
  if (typeof error === "string") return error
  if (error instanceof Error) {
    const cause = "cause" in error ? errorText(error.cause) : ""
    return `${error.message} ${cause}`.trim()
  }

  try {
    return JSON.stringify(error)
  } catch {
    return ""
  }
}

export function isStaleServerActionError(error: unknown) {
  const message = errorText(error)
  return /failed[- ]to[- ]find[- ]server[- ]action/i.test(message)
    || /server action.+was not found on the server/i.test(message)
}

export function recoverFromStaleServerAction(error: unknown) {
  if (typeof window === "undefined" || !isStaleServerActionError(error)) return false

  try {
    const previousAttempt = Number(window.sessionStorage.getItem(RECOVERY_KEY) || 0)
    if (Date.now() - previousAttempt < RECOVERY_COOLDOWN_MS) return false
    window.sessionStorage.setItem(RECOVERY_KEY, String(Date.now()))
  } catch {
    // A reload is still the safest recovery when session storage is unavailable.
  }

  window.location.reload()
  return true
}
