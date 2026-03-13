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
                <Button className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
                    <Plus className="mr-2 h-4 w-4" />
                    New Project
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] border-white/10 bg-[#111114] text-white">
                <form action={onSubmit}>
                    <DialogHeader>
                        <DialogTitle>Create Project</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Start a new cinematography project.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name" className="text-white/85">Name</Label>
                            <Input id="name" name="name" placeholder="My Feature Film" required className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description" className="text-white/85">Description (Optional)</Label>
                            <Textarea id="description" name="description" placeholder="A sci-fi noir thriller..." className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
