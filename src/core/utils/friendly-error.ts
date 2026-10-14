/**
 * Turns technical failure text (validation libraries, HTTP/provider errors) into a short,
 * plain sentence for a toast. Messages that are already human pass through unchanged.
 */
export function friendlyError(message: unknown): string {
  const text = typeof message === "string" ? message.trim() : message instanceof Error ? message.message.trim() : ""
  if (!text) return "Something went wrong. Please try again."
  const tooBig = /too big: expected (?:string|array) to have <=\s*(\d+)\s*(characters|items)/i.exec(text)
  if (tooBig) return tooBig[2] === "items" ? `That's too many. The limit is ${tooBig[1]}.` : `That text is too long. Keep it under ${Number(tooBig[1]).toLocaleString()} characters.`
  const tooSmall = /too small: expected (?:string|array) to have >=\s*(\d+)\s*(characters|items)/i.exec(text)
  if (tooSmall) return tooSmall[2] === "items" ? `Add at least ${tooSmall[1]}.` : `Please write at least ${tooSmall[1]} characters.`
  if (/^invalid (input|option|enum|type)|expected .* received/i.test(text)) return "Some settings weren't valid. Refresh the page and try again."
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(text)) return "You seem to be offline. Check your connection and try again."
  if (/timeout|timed out|aborted/i.test(text)) return "That took too long. Please try again."
  if (/unauthori[sz]ed|jwt|not authenticated|401/i.test(text)) return "Your session has ended. Please sign in again."
  if (/rate limit|429|too many requests/i.test(text)) return "We're busy right now. Please wait a moment and try again."
  if (/internal server error|500|unexpected token|syntaxerror/i.test(text)) return "Something went wrong on our side. Please try again."
  return text
}
