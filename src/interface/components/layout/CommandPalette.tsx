"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogTitle } from "@/interface/components/ui/dialog"
import { Input } from "@/interface/components/ui/input"
import { Button } from "@/interface/components/ui/button"
import { Command, Film, FolderKanban, GalleryHorizontalEnd, Sparkles, Video, Wand2 } from "lucide-react"

type CommandItem = {
  id: string
  label: string
  hint?: string
  keywords: string
  run: () => void
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isMetaK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"
      if (isMetaK) {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
      if (event.key === "Escape") {
        setOpen(false)
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const commands = useMemo<CommandItem[]>(
    () => [
      { id: "dashboard", label: "Open Dashboard", hint: "Overview", keywords: "dashboard overview home", run: () => router.push("/dashboard") },
      { id: "studio", label: "Open Studio", hint: "Scene workspace", keywords: "studio scene shots", run: () => router.push("/dashboard/studio") },
      { id: "gallery", label: "Open Gallery", hint: "Assets", keywords: "gallery assets images videos", run: () => router.push("/dashboard/gallery") },
      { id: "fast-video", label: "Open Fast Video", hint: "Direct video", keywords: "fast video kie generate", run: () => router.push("/dashboard/fast-video") },
      { id: "exports", label: "Open Exports", hint: "Render queue", keywords: "exports queue", run: () => router.push("/dashboard/exports") },
      { id: "projects", label: "Open Projects", hint: "All projects", keywords: "projects list", run: () => router.push("/dashboard/projects") },
      {
        id: "new-project",
        label: "Create New Project",
        hint: "Jump to creation",
        keywords: "new project create",
        run: () => {
          router.push("/dashboard")
          setTimeout(() => {
            const trigger = document.querySelector("[data-tour='create-project']") as HTMLElement | null
            trigger?.click()
          }, 120)
        },
      },
      {
        id: "start-tour",
        label: "Start Product Tour",
        hint: "New user guide",
        keywords: "tour onboarding guide help",
        run: () => {
          window.dispatchEvent(new CustomEvent("aisas:start-tour"))
        },
      },
    ],
    [router]
  )

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return commands
    return commands.filter((item) => `${item.label} ${item.hint || ""} ${item.keywords}`.toLowerCase().includes(value))
  }, [commands, query])

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="hidden rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 lg:flex"
      >
        <Command className="h-3.5 w-3.5" />
        Command
        <span className="rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-white/45">⌘K</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl border-white/10 bg-[#0c0c0f] text-white" showCloseButton={false}>
          <DialogTitle className="sr-only">Command Palette</DialogTitle>
          <div className="space-y-3">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Jump to pages, actions, and tools..."
              className="h-10 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/10"
                  onClick={() => {
                    item.run()
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  <span>{item.label}</span>
                  {item.hint ? <span className="text-xs text-white/45">{item.hint}</span> : null}
                </button>
              ))}
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-6 text-center text-xs text-white/50">
                  No matches. Try &quot;studio&quot;, &quot;gallery&quot;, or &quot;tour&quot;.
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"><FolderKanban className="h-3 w-3" /> Projects</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"><Film className="h-3 w-3" /> Studio</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"><GalleryHorizontalEnd className="h-3 w-3" /> Gallery</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"><Video className="h-3 w-3" /> Fast Video</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"><Wand2 className="h-3 w-3" /> Generate</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1"><Sparkles className="h-3 w-3" /> Tour</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
