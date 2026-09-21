const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone"

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: string }

export type JevChoiceAnswer = {
  type: "choice"
  choice: string
  confidence: number
  probabilities: Record<string, number>
}

export type JevScoreAnswer = {
  type: "score"
  score: number
  confidence: number
  legend: Record<string, string>
  probabilities: Record<string, number>
}

export type JevNoulAnswer = { type: "noul"; noul: number }
export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer

export type JevResponse = {
  model: string
  answers: Record<string, JevAnswer>
  usage?: { input_tokens: number; output_tokens: number }
}

export class JevConfigurationError extends Error {
  constructor(message = "Jev is not configured. Set TYPESAFE_API_KEY in the server environment.") {
    super(message)
    this.name = "JevConfigurationError"
  }
}

export class JevRequestError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message)
    this.name = "JevRequestError"
  }
}

function readErrorMessage(body: unknown) {
  if (!body || typeof body !== "object") return undefined
  const value = body as { error?: unknown; message?: unknown }
  if (typeof value.message === "string") return value.message
  if (typeof value.error === "string") return value.error
  if (value.error && typeof value.error === "object" && "message" in value.error && typeof value.error.message === "string") return value.error.message
  return undefined
}

/**
 * Server-only TypeSafe Jev client. Keep decisions bounded and execute their
 * resulting actions through ordinary application policy, never directly here.
 */
export async function decideWithJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options: { model?: string; signal?: AbortSignal } = {},
): Promise<JevResponse> {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim()
  if (!apiKey) throw new JevConfigurationError()
  if (Object.keys(questions).length === 0) throw new JevRequestError("Jev needs at least one question.")

  let response: Response
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: options.model || "jev-latest", questions }),
      signal: options.signal || AbortSignal.timeout(15_000),
      cache: "no-store",
    })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "network request failed"
    throw new JevRequestError(`Jev request failed: ${detail}`)
  }

  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) throw new JevRequestError(readErrorMessage(body) || `Jev returned HTTP ${response.status}.`, response.status)
  if (!body || typeof body !== "object" || !("answers" in body) || !("model" in body)) {
    throw new JevRequestError("Jev returned an invalid response shape.")
  }
  return body as JevResponse
}

/** Use this after `decideWithJev` to keep human-review policy explicit. */
export function requiresHumanReview(answer: JevAnswer, minimumConfidence = 0.85) {
  if (answer.type === "noul") return Math.abs(answer.noul - 0.5) * 2 < minimumConfidence
  return answer.confidence < minimumConfidence
}
