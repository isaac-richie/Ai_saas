"use client"

import { useRef, useState } from "react"
import { CloudDownload, CloudUpload } from "lucide-react"
import { referenceLibrarySchema, type MediaReference } from "@/core/validation/media-reference"

export function ReferenceLibrarySync({ references, onLoad, disabled, onBusy }: {
  references: MediaReference[]
  onLoad: (refs: MediaReference[]) => void
  disabled: boolean
  onBusy: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const revision = useRef<number | null>(null)
  const savedContent = useRef("")
  const lastMessageContent = useRef("")
  const content = JSON.stringify(references)
  async function sync(mode: "save" | "load") {
    setBusy(true)
    onBusy(true)
    setMessage("")
    lastMessageContent.current = content
    try {
      if (mode === "load" || revision.current === null) {
        const response = await fetch("/api/media/references/library", { cache: "no-store", signal: AbortSignal.timeout(15000) })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Could not read cloud setup")
        const remote = referenceLibrarySchema.parse(body.references)
        if (mode === "load") {
          if (!body.revision) {
            setMessage("No saved cloud setup yet. Your local references are unchanged.")
            return
          }
          if (references.length && !window.confirm("Replace this browser's reference setup with the cloud version? Unsaved local settings will be replaced; stored files and takes are unchanged.")) return
          revision.current = body.revision
          savedContent.current = JSON.stringify(remote)
          lastMessageContent.current = savedContent.current
          onLoad(remote)
          setMessage("Cloud setup loaded.")
          return
        }
        if (body.revision && JSON.stringify(remote) !== content && !window.confirm("A cloud setup already exists. Replace it with this browser's setup? Choose Cancel, then Load setup to keep the cloud version.")) return
        revision.current = body.revision
      }
      if (new TextEncoder().encode(content).length > 850000) throw new Error("This library is too large. Detach older references before saving.")
      const response = await fetch("/api/media/references/library", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ references, revision: revision.current }), signal: AbortSignal.timeout(15000) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Cloud save failed")
      revision.current = body.revision
      savedContent.current = content
      setMessage("Setup saved to your account. Load it on another device to continue.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud sync failed. Local setup is unchanged.")
    } finally { setBusy(false); onBusy(false) }
  }
  const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-xs text-white/80 disabled:opacity-40"
  return <div className="space-y-2 rounded-xl border border-white/10 p-3">
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={busy || disabled} onClick={() => void sync("save")}><CloudUpload size={14} />Save setup</button>
      <button type="button" className={buttonClass} disabled={busy || disabled} onClick={() => void sync("load")}><CloudDownload size={14} />Load setup</button>
    </div>
    <p className="text-[11px] leading-relaxed text-white/60" role="status">{busy ? "Syncing reference setup..." : message && lastMessageContent.current === content ? message : savedContent.current && savedContent.current !== content ? "Local changes not yet saved to your account." : "Save all reference scopes to your account, or load them on another device."}</p>
  </div>
}
