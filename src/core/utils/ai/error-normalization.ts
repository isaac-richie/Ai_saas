const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()

export function normalizeGenerationError(rawMessage?: string, fallback = "Generation failed") {
  if (!rawMessage) return fallback
  const compact = normalizeWhitespace(rawMessage)
  const lower = compact.toLowerCase()

  if (/(hallucin|try run prompt again|run prompt again)/i.test(lower)) {
    return "The provider returned an unstable output error. Refine the prompt details and run again."
  }

  if (/(recordinfo is null|record info is null|task not found|record not found|not ready|still processing)/i.test(lower)) {
    return "Render is still initializing on the provider. Keep polling for a few more seconds."
  }

  if (/(duration.*range|duration.*allowed options|allowed duration)/i.test(lower)) {
    return "This model supports limited durations. Use 5s, 10s, or 15s."
  }

  if (/(model name.*not supported|unsupported model)/i.test(lower)) {
    return "Selected model is not available right now. Choose another model and retry."
  }

  if (/(image_url is required|requires image_url|reference image required)/i.test(lower)) {
    return "This generation mode requires a source image. Upload/select an image and retry."
  }

  if (/(fetch failed|network error|und_err_socket|socket|econnreset|etimedout|timeout)/i.test(lower)) {
    return "Temporary network issue while contacting the provider. Retry in a moment."
  }
  
  if (/(safety system|content_policy_violation|safety policy|flagged as sensitive)/i.test(lower)) {
    return "The prompt was rejected by the provider's safety system. Use non-graphic, non-explicit wording, avoid minors in sensitive contexts, and try again."
  }

  return compact || fallback
}

export function isSafetyRejection(message: string): boolean {
  const lower = message.toLowerCase()
  return /(safety system|content_policy_violation|safety policy|flagged as sensitive)/i.test(lower)
}
