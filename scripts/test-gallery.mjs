import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const gallery = read("../src/interface/components/media/MediaGallery.tsx")

test("one shared lightbox browses the filtered gallery with arrow keys", () => {
  assert.doesNotMatch(gallery, /<DialogTrigger/, "no per-card dialogs")
  assert.equal((gallery.match(/<Dialog /g) || []).length, 1)
  assert.match(gallery, /event\.key === "ArrowRight"\) \{ event\.preventDefault\(\); step\(1\) \}/)
  assert.match(gallery, /event\.key === "ArrowLeft"\) \{ event\.preventDefault\(\); step\(-1\) \}/)
  assert.match(gallery, /\(activeIndex \+ delta \+ filteredAssets\.length\) % filteredAssets\.length/, "browsing wraps around")
  assert.match(gallery, /\{activeIndex \+ 1\} \/ \{filteredAssets\.length\}/)
})

test("video thumbnails play on hover instead of all at once", () => {
  const thumb = gallery.slice(gallery.indexOf("function HoverVideo"))
  assert.doesNotMatch(thumb, /autoPlay/)
  assert.match(thumb, /onMouseEnter=\{play\}/)
  assert.match(thumb, /preload="metadata"/)
})

test("bulk actions live in a floating toolbar and keep every existing action", () => {
  assert.match(gallery, /role="toolbar"\s+aria-label="Selection actions"/)
  for (const handler of ["handleMoveSelected", "handleQueueExport", "handleDelete(Array.from(selectedIds))", "selectAllFiltered"]) assert.ok(gallery.includes(handler), handler)
  for (const handler of ["handleAddToSequence(activeAsset)", "copyPrompt(activeAsset.prompt)", "copyUrl(activeAsset.url)", "pollPendingGalleryAssets"]) assert.ok(gallery.includes(handler), handler)
})

test("new users get a welcome with a way to create; filters can be cleared in one click", () => {
  assert.match(gallery, /live here/)
  assert.match(gallery, /href="\/dashboard\/fast-video"/)
  assert.match(gallery, /setQuery\(""\); setFilter\("all"\)/)
})

test("cached images never stay hidden behind the loading shimmer", () => {
  assert.match(gallery, /node\?\.complete && node\.naturalWidth > 0 && !loaded\) setLoaded\(true\)/)
})

test("keyboard shortcuts tolerate events that do not target an element", () => {
  assert.match(gallery, /event\.target instanceof HTMLElement \? event\.target : null/)
  assert.doesNotMatch(gallery, /target\?\.getAttribute\(/)
})

test("dialogs honour the width they ask for", () => {
  const dialog = read("../src/interface/components/ui/dialog.tsx")
  assert.doesNotMatch(dialog, /sm:max-w-lg/, "a breakpoint cap would override every caller's max-width")
  assert.match(dialog, /w-\[calc\(100%-2rem\)\] max-w-lg/)
})
