"use client"

import type * as React from "react"

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
      { id: "create", label: "Create a video", hint: "Quick video", keywords: "create fast video generate new make clip", run: () => router.push("/dashboard/fast-video") },
      { id: "film", label: "Plan a longer film", hint: "Several shots", keywords: "film story shots plan storyboard", run: () => router.push("/dashboard/fast-video?mode=film") },
      { id: "dashboard", label: "Go home", hint: "Home", keywords: "dashboard overview home", run: () => router.push("/dashboard") },
      { id: "studio", label: "Open Studio", hint: "Scenes and shots", keywords: "studio scene shots", run: () => router.push("/dashboard/studio") },
      { id: "gallery", label: "Open my videos", hint: "Everything you've made", keywords: "gallery assets images videos my", run: () => router.push("/dashboard/gallery") },
      { id: "exports", label: "Open downloads", hint: "Exports", keywords: "exports downloads queue", run: () => router.push("/dashboard/exports") },
      { id: "projects", label: "Open projects", hint: "All projects", keywords: "projects list", run: () => router.push("/dashboard/projects") },
      {
        id: "new-project",
        label: "Create New Project",
        hint: "Jump to creation",
        keywords: "new project create",
        run: () => {
          router.push("/dashboard/projects")
          setTimeout(() => {
            const trigger = document.querySelector("[data-tour='create-project']") as HTMLElement | null
            trigger?.click()
          }, 600)
        },
      },
      {
        id: "start-tour",
        label: "Take the quick tour",
        hint: "30 seconds",
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
        className="workspace-topbar-pill hidden w-56 justify-start lg:flex"
      >
        <Command className="h-3.5 w-3.5 text-gold-400" />
        <span className="text-[#8f9086]">Search the studio…</span>
        <span className="lux-kbd ml-auto">⌘K</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 text-white" showCloseButton={false}>
          <DialogTitle className="sr-only">Command Palette</DialogTitle>
          <div>
            <div className="flex items-center gap-3 border-b border-gold-400/10 px-5">
              <Command className="h-4 w-4 shrink-0 text-gold-400" />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Jump to pages, actions, and tools..."
                className="h-14 border-0 bg-transparent px-0 text-[15px] text-white shadow-none placeholder:text-[#77796f] focus-visible:ring-0 dark:bg-transparent"
              />
              <span className="lux-kbd">esc</span>
            </div>
            <div className="lux-stagger max-h-80 space-y-1 overflow-y-auto p-2">
              {filtered.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  style={{ "--i": index } as React.CSSProperties}
                  className="group flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2.5 text-left text-sm text-[#d4cfc0] transition-all duration-300 hover:border-gold-400/20 hover:bg-gold-400/[0.07] hover:pl-4 hover:text-gold-100 focus-visible:border-gold-400/30 focus-visible:bg-gold-400/[0.07] focus-visible:outline-none"
                  onClick={() => {
                    item.run()
                    setOpen(false)
                    setQuery("")
                  }}
                >
                  <span>{item.label}</span>
                  <span className="flex items-center gap-2">
                    {item.hint ? <span className="text-xs text-[#8f9086]">{item.hint}</span> : null}
                    <span className="text-gold-400 opacity-0 transition-opacity group-hover:opacity-100">↵</span>
                  </span>
                </button>
              ))}
              {filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gold-400/15 bg-white/[0.02] px-3 py-8 text-center text-xs text-[#8f9086]">
                  No matches. Try &quot;studio&quot;, &quot;gallery&quot;, or &quot;tour&quot;.
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-gold-400/10 bg-black/20 px-4 py-3 text-[11px] text-[#8f9086]">
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-gold-400/[0.03] px-2 py-1"><FolderKanban className="h-3 w-3" /> Projects</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-gold-400/[0.03] px-2 py-1"><Film className="h-3 w-3" /> Studio</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-gold-400/[0.03] px-2 py-1"><GalleryHorizontalEnd className="h-3 w-3" /> Gallery</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-gold-400/[0.03] px-2 py-1"><Video className="h-3 w-3" /> Fast Video</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-gold-400/[0.03] px-2 py-1"><Wand2 className="h-3 w-3" /> Generate</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gold-400/10 bg-gold-400/[0.03] px-2 py-1"><Sparkles className="h-3 w-3" /> Tour</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
