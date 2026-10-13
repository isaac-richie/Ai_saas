"use client"

import { Button } from "@/interface/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/interface/components/ui/dialog"
import { Input } from "@/interface/components/ui/input"
import { Label } from "@/interface/components/ui/label"
import { Textarea } from "@/interface/components/ui/textarea"
import { useState } from "react"
import { createProject } from "@/core/actions/projects"
import { Loader2, Plus } from "lucide-react"
import { useRouter } from "next/navigation"

export function CreateProjectDialog() {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    async function onSubmit(formData: FormData) {
        setLoading(true)
        const res = await createProject(formData)
        setLoading(false)

        if (!res.error) {
            setOpen(false)
            router.refresh()
        } else {
            alert("Error creating project: " + res.error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button data-tour="create-project" className="min-h-11 rounded-xl border border-gold-300/40 bg-gold-400/[0.1] text-gold-50 hover:bg-gold-400/[0.18]">
                    <Plus className="mr-2 h-4 w-4" />
                    New film project
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] border-gold-400/[0.12] bg-obsidian-800 text-white">
                <form action={onSubmit} autoComplete="off">
                    <DialogHeader>
                        <DialogTitle>New film project</DialogTitle>
                        <DialogDescription className="text-[#B0B8C4]">
                            A project holds the scenes and shots of one film. You can rename it later.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name" className="text-white/85">Name</Label>
                            <Input
                                id="name"
                                name="name"
                                autoComplete="new-password"
                                placeholder="e.g. Summer lookbook"
                                required
                                className="rounded-xl border-gold-400/[0.12] bg-white/5 text-white placeholder:text-white/35"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description" className="text-white/85">What is it about? (optional)</Label>
                            <Textarea
                                id="description"
                                name="description"
                                autoComplete="off"
                                placeholder="e.g. A 30-second fashion film shot at golden hour"
                                className="rounded-xl border-gold-400/[0.12] bg-white/5 text-white placeholder:text-white/35"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="rounded-xl border border-gold-400/[0.12] bg-white/10 text-white hover:bg-gold-400/[0.12] hover:text-gold-50">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create project
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
