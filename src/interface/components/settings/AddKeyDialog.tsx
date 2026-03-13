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
import { useState } from "react"
import { addApiKey } from "@/core/actions/api-keys"

interface AddKeyDialogProps {
    providerId: string
    providerName: string
    onSuccess: () => void
}

export function AddKeyDialog({ providerId, providerName, onSuccess }: AddKeyDialogProps) {
    const [open, setOpen] = useState(false)
    const [key, setKey] = useState("")
    const [loading, setLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        await addApiKey(providerId, key)
        setLoading(false)
        setOpen(false)
        setKey("")
        onSuccess()
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10">Connect</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[460px] border-white/10 bg-[#111114] text-white">
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Connect {providerName}</DialogTitle>
                        <DialogDescription className="text-white/50">
                            Paste your API key. It is encrypted before storage.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="api-key">API Key</Label>
                            <Input
                                id="api-key"
                                type="password"
                                value={key}
                                onChange={(e) => setKey(e.target.value)}
                                className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                placeholder="sk-..."
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
                            {loading ? "Saving..." : "Save Key"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
