"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/interface/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Badge } from "@/interface/components/ui/badge"
import { toast } from "sonner"

type Sequence = {
    id: string
    name: string
    status: string
    output_url: string | null
    created_at: string
}

interface SequenceListProps {
    sequences: Sequence[]
}

export function SequenceList({ sequences }: SequenceListProps) {
    const [stitchingId, setStitchingId] = useState<string | null>(null)
    const router = useRouter()

    const handleStitch = async (sequenceId: string) => {
        setStitchingId(sequenceId)
        try {
            const res = await fetch(`/api/sequences/${sequenceId}/stitch`, { method: "POST" })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to stitch sequence")
            toast.success("Sequence rendered")
            router.refresh()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Failed to stitch sequence"
            toast.error(message)
        } finally {
            setStitchingId(null)
        }
    }

    if (sequences.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] p-4 text-sm text-white/55">
                No sequences yet. Select shots and create one.
            </div>
        )
    }

    return (
        <div className="grid gap-3">
            {sequences.map((sequence) => (
                <Card key={sequence.id} className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                    <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between text-base">
                            <span className="line-clamp-1">{sequence.name}</span>
                            <Badge className="rounded-full border border-white/10 bg-white/10 text-[10px] uppercase tracking-[0.2em] text-white/70">
                                {sequence.status}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-white/55">
                        <span>{new Date(sequence.created_at).toLocaleDateString()}</span>
                        <div className="flex gap-2">
                            {sequence.output_url && (
                                <a
                                    href={sequence.output_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                                >
                                    View Output
                                </a>
                            )}
                            <Button
                                size="sm"
                                onClick={() => handleStitch(sequence.id)}
                                disabled={stitchingId === sequence.id}
                                className="rounded-lg border border-white/10 bg-white/10 px-3 py-1 text-xs text-white hover:bg-white/20"
                            >
                                {stitchingId === sequence.id ? "Rendering..." : "Stitch Video"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
