/**
 * Minimal Kie client for Mimic video tasks. Every create call reports whether a failure is definite
 * (nothing was started) or ambiguous (it may have started), so a paid job is never retried blindly.
 */
const BASE = "https://api.kie.ai/api/v1"

export type MimicCreateResult = { ok: true; taskId: string } | { ok: false; definite: boolean; message: string }

export async function createKieMimicTask(apiKey: string, body: { model: string; input: Record<string, unknown> }, fetcher: typeof fetch = fetch): Promise<MimicCreateResult> {
  let response: Response
  try {
    response = await fetcher(`${BASE}/jobs/createTask`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    // Timed out or the connection dropped after sending: the provider may have accepted it.
    return { ok: false, definite: false, message: "We couldn't confirm whether the take started." }
  }
  const json = await response.json().catch(() => null) as { code?: number; msg?: string; data?: { taskId?: string } } | null
  if (!json) return { ok: false, definite: response.status >= 400 && response.status < 500, message: "The video service sent an unreadable reply." }
  if (json.code === 200 && typeof json.data?.taskId === "string" && json.data.taskId) return { ok: true, taskId: json.data.taskId }
  const message = json.code === 402 ? "The video service is out of credits. Nothing was created."
    : json.code === 429 ? "The video service is busy. Try again in a minute."
    : json.code === 401 ? "The video service key isn't valid."
    : (typeof json.msg === "string" && json.msg ? json.msg.slice(0, 200) : "The video service refused this take.")
  // A coded refusal means nothing started; a 5xx without a clear code is ambiguous.
  return { ok: false, definite: typeof json.code === "number" && json.code !== 500, message }
}

export async function getKieMimicTask(apiKey: string, taskId: string, fetcher: typeof fetch = fetch): Promise<unknown | null> {
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
