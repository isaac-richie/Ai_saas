export type CrewFailureReason =
  | "ai_key" | "ai_credits" | "ai_busy" | "ai_outage" | "timeout" | "network" | "safety" | "too_long" | "unknown"

export type CrewFailure = { reason: CrewFailureReason; title: string; description: string }

/**
 * Names why a crew stage stopped, in plain words for a toast. The raw provider text stays in
 * server logs and planning_error; creators only see what happened and what to do next.
 */
export function describeCrewFailure(message: string, stage = "this step"): CrewFailure {
  const saved = "Your film is saved where it stopped."
  if (/api key has expired|incorrect api key|invalid_api_key|invalid api key|\b401\b|authentication/i.test(message)) {
    return { reason: "ai_key", title: "AI connection key expired", description: `The studio's AI key needs renewing, so the crew can't plan right now. ${saved} We're on it. Resume once it's fixed.` }
  }
  if (/credits are exhausted|no credits remaining|insufficient_quota|exceeded your current quota|billing_hard_limit/i.test(message)) {
    return { reason: "ai_credits", title: "AI planning credits ran out", description: `The studio's AI account is out of credit. ${saved} Resume once it's topped up.` }
  }
  if (/\b429\b|rate limit|too many requests/i.test(message)) {
    return { reason: "ai_busy", title: "The AI is busy", description: `Too many requests at once. ${saved} Wait a minute, then resume.` }
  }
  if (/blocked by safety policy|generation guidelines|content policy/i.test(message)) {
    return { reason: "safety", title: "A shot needs rewording", description: "Part of the brief tripped the content guidelines. Soften that moment in the brief, then try again." }
  }
  if (/ran out of time|timed out|timeout|aborted|ETIMEDOUT/i.test(message)) {
    return { reason: "timeout", title: `${capitalize(stage)} took too long`, description: `Long films can need a second pass. ${saved} Resume to pick up from the last checkpoint.` }
  }
  if (/fetch failed|ECONNRESET|ENOTFOUND|socket hang up|network/i.test(message)) {
    return { reason: "network", title: "Connection dropped", description: `We lost the link to the AI service. ${saved} Resume to continue.` }
  }
  if (/\b5\d\d\b|overloaded|server_error|service unavailable|bad gateway/i.test(message)) {
    return { reason: "ai_outage", title: "AI service hiccup", description: `The AI provider had a temporary problem. ${saved} Resume in a moment.` }
  }
  if (/field limit|too_big|zod/i.test(message)) {
    return { reason: "too_long", title: "The crew wrote too much", description: `A reply ran past a studio limit. ${saved} Resume to try that step again.` }
  }
  return { reason: "unknown", title: `The crew stopped at ${stage}`, description: `${saved} Resume to try again. If it keeps happening, let us know.` }
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
