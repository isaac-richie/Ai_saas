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
import { createScene } from "@/core/actions/scenes"
import { Loader2, Plus } from "lucide-react"

interface CreateSceneDialogProps {
    projectId: string
}

export function CreateSceneDialog({ projectId }: CreateSceneDialogProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    // Use a transition if we were using use server actions with hooks, but simple async/await wrapper works here for MVP
    // Ideally useFormState/useFormStatus but sticking to simple pattern for speed.
    async function onSubmit(formData: FormData) {
        setLoading(true)
        const res = await createScene(projectId, formData)
        setLoading(false)

        if (!res.error) {
            setOpen(false)
        } else {
            alert("Error creating scene: " + res.error)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Scene
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] border-white/10 bg-[#111114] text-white">
                <form action={onSubmit} autoComplete="off">
                    <DialogHeader>
                        <DialogTitle>Add Scene</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Create a new scene for your storyboard.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name" className="text-white/85">Scene Name</Label>
                            <Input
                                id="name"
                                name="name"
                                autoComplete="new-password"
                                placeholder="INT. DINER - NIGHT"
                                required
                                className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="sequence_order" className="text-white/85">Sequence #</Label>
                            <Input
                                id="sequence_order"
                                name="sequence_order"
                                autoComplete="off"
                                type="number"
                                defaultValue="1"
                                required
                                className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description" className="text-white/85">Description (Optional)</Label>
                            <Textarea
                                id="description"
                                name="description"
                                autoComplete="off"
                                placeholder="Characters discuss the heist plan..."
                                className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Scene
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
