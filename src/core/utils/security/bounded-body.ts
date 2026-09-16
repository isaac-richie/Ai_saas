export async function readBoundedBytes(request: Pick<Request, "body">, limit: number) {
  if (!request.body) return Buffer.alloc(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) throw new Error("Request is too large.")
      chunks.push(chunk.value)
    }
  } finally { await reader.cancel() }
  return Buffer.concat(chunks)
}

export async function readBoundedBody(request: Request, limit: number) {
  return (await readBoundedBytes(request, limit)).toString("utf8")
}
