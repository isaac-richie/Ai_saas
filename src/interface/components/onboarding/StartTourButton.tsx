"use client"

export function StartTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("aisas:start-tour"))}
      className="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
    >
      Start Tour
    </button>
  )
}
