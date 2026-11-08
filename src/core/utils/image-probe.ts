/**
 * Reads an image's real type and pixel size from its bytes (not its name or headers), for JPEG, PNG and
 * WebP. Returns null for anything else or a truncated file.
 */
export type ImageProbe = { contentType: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number }

export function probeImage(bytes: Uint8Array): ImageProbe | null {
  const b = bytes
  const u16be = (i: number) => (b[i] << 8) | b[i + 1]
  const u16le = (i: number) => b[i] | (b[i + 1] << 8)
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]

  // PNG: signature, then IHDR width/height.
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const width = u32be(16), height = u32be(20)
    return width && height ? { contentType: "image/png", width, height } : null
  }

  // JPEG: walk markers to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue }
      const marker = b[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue }
      const length = u16be(i + 2)
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        const height = u16be(i + 5), width = u16be(i + 7)
        return width && height ? { contentType: "image/jpeg", width, height } : null
      }
      if (length < 2) return null
      i += 2 + length
    }
    return null
  }

  // WebP: RIFF....WEBP then VP8 / VP8L / VP8X.
  if (b.length >= 30 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") {
    const chunk = String.fromCharCode(...b.slice(12, 16))
    if (chunk === "VP8 ") return { contentType: "image/webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff }
    if (chunk === "VP8L") {
      const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { contentType: "image/webp", width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1 }
    }
    if (chunk === "VP8X") return { contentType: "image/webp", width: u24le(24) + 1, height: u24le(27) + 1 }
    return null
  }
  return null
}
