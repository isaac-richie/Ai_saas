/**
 * Minimal Kie client for audio tasks (ElevenLabs speech, Suno music and sounds). Every call reports
 * whether a failure is definite (nothing was started) or ambiguous (it may have started), so the
 * caller never retries a paid job blindly.
 */
const BASE = "https://api.kie.ai/api/v1"

export type CreateResult = { ok: true; taskId: string } | { ok: false; definite: boolean; message: string }

export async function createKieAudioTask(apiKey: string, body: { model: string; input: Record<string, unknown> }, fetcher: typeof fetch = fetch): Promise<CreateResult> {
  let response: Response
  try {
    response = await fetcher(`${BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    // Timed out or the connection dropped after sending: Kie may have accepted it.
    return { ok: false, definite: false, message: "We couldn't confirm whether the audio request started." }
  }
  const json = await response.json().catch(() => null) as { code?: number; msg?: string; data?: { taskId?: string } } | null
  if (!json) return { ok: false, definite: response.status >= 400 && response.status < 500, message: "The audio service sent an unreadable reply." }
  if (json.code === 200 && typeof json.data?.taskId === "string" && json.data.taskId) return { ok: true, taskId: json.data.taskId }
  const message = json.code === 402 ? "The audio service is out of credits. Nothing was created."
    : json.code === 429 ? "The audio service is busy. Try again in a minute."
    : json.code === 401 ? "The audio service key isn't valid."
    : (typeof json.msg === "string" && json.msg ? json.msg.slice(0, 200) : "The audio request was refused.")
  // A coded refusal means nothing started; 5xx without a code is ambiguous.
  return { ok: false, definite: typeof json.code === "number" && json.code !== 500, message }
}

export async function getKieAudioTask(apiKey: string, taskId: string, fetcher: typeof fetch = fetch): Promise<unknown | null> {
  try {
    const response = await fetcher(`${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    })
    const json = await response.json().catch(() => null) as { code?: number; data?: unknown } | null
    return json?.code === 200 ? json.data ?? null : null
  } catch {
    return null
  }
}
