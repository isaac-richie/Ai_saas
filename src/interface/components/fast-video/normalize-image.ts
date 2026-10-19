/** Longest side we keep: sharp for 4K video references, well under every provider's image limits. */
const MAX_SIDE = 3072
const MAX_BYTES = 10 * 1024 * 1024

export class ImageNormalizeError extends Error {}

/**
 * Makes any photo usable as a reference: JPG/PNG under 10 MB pass through untouched; WebP, AVIF,
 * GIF, HEIC (where the browser can read it) and oversized images are redrawn as a high-quality JPEG,
 * resized to at most 3072 px on the long side.
 */
export async function normalizeReferenceImage(file: File): Promise<File> {
  const ok = ["image/jpeg", "image/png"].includes(file.type) && file.size > 0 && file.size <= MAX_BYTES
  if (ok) return file
  const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new ImageNormalizeError(heic
      ? "This browser can't read iPhone HEIC photos. On iPhone, share the photo as JPG (or set Camera → Formats → Most Compatible), then add it again."
      : `${file.name} isn't an image this browser can read. Try saving it as JPG or PNG.`)
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext("2d")
  if (!context) throw new ImageNormalizeError("Couldn't prepare this image. Try a JPG or PNG.")
  // JPEG has no transparency: put PNG/WebP cut-outs on white instead of black.
  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.92, 0.85, 0.75]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
    if (blob && blob.size <= MAX_BYTES) return new File([blob], `${file.name.replace(/\.[a-z0-9]+$/i, "")}.jpg`, { type: "image/jpeg" })
  }
  throw new ImageNormalizeError("This image is too large even after resizing. Try a smaller export.")
}
