export function sanitizeFilename(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

export function inferExtensionFromUrl(url: string, fallback: "image" | "video" = "image"): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    if (pathname.endsWith(".mp4")) return "mp4"
    if (pathname.endsWith(".mov")) return "mov"
    if (pathname.endsWith(".webm")) return "webm"
    if (pathname.endsWith(".png")) return "png"
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "jpg"
    if (pathname.endsWith(".webp")) return "webp"
  } catch {
    // ignore and use fallback below
  }
  return fallback === "video" ? "mp4" : "png"
}

export function buildMediaFilename(params: {
  base?: string
  kind: "image" | "video"
  url: string
  suffix?: string
}): string {
  const base = sanitizeFilename(params.base || `visiowave-${params.kind}`) || `visiowave-${params.kind}`
  const extension = inferExtensionFromUrl(params.url, params.kind)
  const suffix = params.suffix ? `-${sanitizeFilename(params.suffix)}` : ""
  return `${base}${suffix}.${extension}`
}

