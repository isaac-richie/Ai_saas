"use client"

import { Scene, deleteScene, moveScene, renameScene } from "@/core/actions/scenes"
import { Card, CardContent, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { Badge } from "@/interface/components/ui/badge"
import Link from "next/link"
import { ArrowDown, ArrowUp, Clapperboard, Film, Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface SceneCardProps {
    scene: Scene & { shots?: { count: number }[] }
    projectId: string
    isFirst: boolean
    isLast: boolean
}

export function SceneCard({ scene, projectId, isFirst, isLast }: SceneCardProps) {
    const shotCount = scene.shots?.[0]?.count || 0
    const router = useRouter()
    const [isBusy, setIsBusy] = useState(false)

    const blockCardNav = (event: React.MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
    }

    const onRename = async (event: React.MouseEvent) => {
        blockCardNav(event)
        const nextName = window.prompt("Rename scene", scene.name)
        if (!nextName || nextName.trim() === scene.name) return

        setIsBusy(true)
        const result = await renameScene(projectId, scene.id, nextName)
        setIsBusy(false)

        if (result.error) {
            alert(`Rename failed: ${result.error}`)
            return
        }
        router.refresh()
    }

    const onDelete = async (event: React.MouseEvent) => {
        blockCardNav(event)
        const confirmed = window.confirm("Delete this scene? All shots in it will be removed.")
        if (!confirmed) return

        setIsBusy(true)
        const result = await deleteScene(projectId, scene.id)
        setIsBusy(false)

        if (result.error) {
            alert(`Delete failed: ${result.error}`)
            return
        }
        router.refresh()
    }

    const onMove = async (event: React.MouseEvent, direction: "up" | "down") => {
        blockCardNav(event)
        setIsBusy(true)
        const result = await moveScene(projectId, scene.id, direction)
        setIsBusy(false)

        if (result.error) {
            alert(`Reorder failed: ${result.error}`)
            return
        }
        router.refresh()
    }

    return (
        <Link href={`/dashboard/projects/${projectId}/scenes/${scene.id}`} className="group block h-full" data-reveal="card">
            <Card className="h-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20">
                <div className="relative aspect-video w-full overflow-hidden border-b border-white/10 bg-white/[0.03] p-4">
                    <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1">
                        <button
                            type="button"
                            onClick={(event) => onMove(event, "up")}
                            disabled={isBusy || isFirst}
                            className="rounded-md border border-white/10 bg-[#0f0f12] p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Move scene up"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => onMove(event, "down")}
                            disabled={isBusy || isLast}
                            className="rounded-md border border-white/10 bg-[#0f0f12] p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Move scene down"
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onRename}
                            disabled={isBusy}
                            className="rounded-md border border-white/10 bg-[#0f0f12] p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Rename scene"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={isBusy}
                            className="rounded-md border border-white/10 bg-[#0f0f12] p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Delete scene"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="relative flex h-full items-center justify-center">
                        <Clapperboard className="h-9 w-9 text-white/45 transition-transform duration-300 group-hover:scale-105" />
                    </div>
                    <Badge className="absolute bottom-2.5 right-2.5 border border-white/10 bg-white/10 text-[10px] text-white">
                        <Film className="mr-1 h-3 w-3" />
                        {shotCount} Shots
                    </Badge>
                </div>
                <CardHeader className="pb-1">
                    <CardTitle className="line-clamp-1 text-base">
                        <span className="mr-2 text-white/40">#{scene.sequence_order}</span>
                        {scene.name}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="line-clamp-2 text-xs text-white/55">
                        {scene.description || "No description."}
                    </p>
                </CardContent>
            </Card>
        </Link>
    )
}
