"use client"

import { toast } from "sonner"
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
    /** Newest finished image from this scene, if any. */
    coverUrl?: string
    isFirst: boolean
    isLast: boolean
}

export function SceneCard({ scene, projectId, coverUrl, isFirst, isLast }: SceneCardProps) {
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
            toast.error(`Couldn't rename the scene: ${result.error}`)
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
            toast.error(`Couldn't delete the scene: ${result.error}`)
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
            toast.error(`Couldn't reorder: ${result.error}`)
            return
        }
        router.refresh()
    }

    return (
        <Link href={`/dashboard/projects/${projectId}/scenes/${scene.id}`} className="group block h-full" data-reveal="card">
            <Card className="lux-lift lux-spotlight h-full gap-4 overflow-hidden rounded-2xl text-white">
                <div className="relative aspect-video w-full overflow-hidden border-b border-line [background:radial-gradient(80%_100%_at_30%_0%,rgba(217,192,138,0.1),transparent_60%),#0e100e] p-4">
                    <div className="absolute left-2.5 top-2.5 z-10 flex items-center gap-1">
                        <button
                            type="button"
                            onClick={(event) => onMove(event, "up")}
                            disabled={isBusy || isFirst}
                            className="rounded-md border border-line bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Move scene up"
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={(event) => onMove(event, "down")}
                            disabled={isBusy || isLast}
                            className="rounded-md border border-line bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Move scene down"
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onRename}
                            disabled={isBusy}
                            className="rounded-md border border-line bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Rename scene"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            disabled={isBusy}
                            className="rounded-md border border-line bg-obsidian-900 p-1.5 text-white/70 transition hover:border-gold-400/40 hover:bg-gold-400/[0.1] hover:text-gold-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label="Delete scene"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    {coverUrl ? (
                        <>
                            {/* Take URLs come from several providers, so they skip the image optimizer. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={coverUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />
                        </>
                    ) : null}
                    <div className={`relative flex h-full items-center justify-center ${coverUrl ? "hidden" : ""}`}>
                        <Clapperboard className="h-9 w-9 text-gold-400/45 transition-all duration-500 group-hover:-rotate-6 group-hover:scale-110 group-hover:text-gold-300" strokeWidth={1.4} />
                    </div>
                    <Badge className="absolute bottom-2.5 right-2.5 border border-line bg-black/40 text-[10px] text-gold-100 backdrop-blur-md">
                        <Film className="mr-1 h-3 w-3" />
                        {shotCount} shot{shotCount === 1 ? "" : "s"}
                    </Badge>
                </div>
                <CardHeader className="pb-1">
                    <CardTitle className="line-clamp-1 text-base">
                        <span className="lux-serif mr-2 text-gold-400/70">#{scene.sequence_order}</span>
                        {scene.name}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {scene.description ? <p className="line-clamp-2 text-[13px] text-[#9aa1ab]">{scene.description}</p> : null}
                    <p className="mt-2 text-[12px] text-[#9aa1ab]">
                        Updated {new Date(scene.updated_at || scene.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                    </p>
                </CardContent>
            </Card>
        </Link>
    )
}
