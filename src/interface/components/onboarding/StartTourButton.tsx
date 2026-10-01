"use client"

export function StartTourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("aisas:start-tour"))}
      className="rounded-lg border border-gold-400/[0.12] bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-gold-400/[0.12] hover:text-gold-50"
    >
      Start Tour
    </button>
  )
}
