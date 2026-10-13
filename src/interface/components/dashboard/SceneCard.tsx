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
            <Card className="lux-lift lux-spotlight h-full gap-4 overflow-hidden rounded-2xl text-white">
                <div className="relative aspect-video w-full overflow-hidden border-b border-gold-400/[0.12] [background:radial-gradient(80%_100%_at_30%_0%,rgba(217,192,138,0.1),transparent_60%),#0e100e] p-4">
                    <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1">
                        <button
                            type="button"
                            onClick={(event) => onMove(event, "up")}
                            disabled={isBusy || isFirst}
                            className="rounded-md border border-gold-400/[0.12] bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Move scene up"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => onMove(event, "down")}
                            disabled={isBusy || isLast}
                            className="rounded-md border border-gold-400/[0.12] bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Move scene down"
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onRename}
                            disabled={isBusy}
                            className="rounded-md border border-gold-400/[0.12] bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Rename scene"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={isBusy}
                            className="rounded-md border border-gold-400/[0.12] bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Delete scene"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <div className="relative flex h-full items-center justify-center">
                        <Clapperboard className="h-9 w-9 text-gold-400/45 transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:text-gold-300" strokeWidth={1.4} />
                    </div>
                    <Badge className="absolute bottom-2.5 right-2.5 border border-gold-400/[0.12] bg-black/40 text-[10px] text-gold-100 backdrop-blur-md">
                        <Film className="mr-1 h-3 w-3" />
                        {shotCount} Shots
                    </Badge>
                </div>
                <CardHeader className="pb-1">
                    <CardTitle className="line-clamp-1 text-base">
                        <span className="lux-serif mr-2 text-gold-400/70">#{scene.sequence_order}</span>
                        {scene.name}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="line-clamp-2 text-xs text-white/55">
                        {scene.description || "No description."}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-white/45">
                        <span>Updated {new Date(scene.updated_at || scene.created_at).toLocaleDateString()}</span>
                        <span>{shotCount} shots</span>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
