"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { deleteProject } from "@/core/actions/projects"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/interface/components/ui/dialog"
import { Button } from "@/interface/components/ui/button"

/** Small trash button on a project card; asks before deleting the project and everything in it. */
export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${name}`}
        title="Delete project"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(true) }}
        className="grid size-9 place-items-center rounded-full border border-white/15 bg-black/50 text-white/80 backdrop-blur-md transition hover:border-rose-300/50 hover:bg-rose-500/20 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
      >
        <Trash2 className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-gold-400/[0.14] bg-obsidian-900 text-white sm:max-w-[420px]" onClick={(event) => event.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Delete “{name}”?</DialogTitle>
            <DialogDescription className="text-[#B0B8C4]">
              This removes the project with all its scenes and shots. It can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" className="rounded-xl" onClick={() => setOpen(false)} disabled={pending}>Keep it</Button>
            <Button
              className="rounded-xl border border-rose-300/40 bg-rose-500/20 text-rose-50 hover:bg-rose-500/30"
              disabled={pending}
              onClick={() => start(async () => {
                const result = await deleteProject(id)
                if (result.error) { toast.error(result.error); return }
                toast.success(`Deleted “${name}”`)
                setOpen(false)
                router.refresh()
              })}
            >
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
