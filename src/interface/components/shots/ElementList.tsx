/* eslint-disable @next/next/no-img-element */
import { ImageIcon } from "lucide-react"
import { getProjectElements } from "@/core/actions/elements"
import { ElementDeleteButton } from "@/interface/components/shots/ElementDeleteButton"

interface ElementListProps {
    projectId: string
}

export async function ElementList({ projectId }: ElementListProps) {
    const res = await getProjectElements(projectId)
    const elements = res.data || []

    if (elements.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-white/15 bg-[#0b0b0d] p-4 text-sm text-white/55">
                No elements yet. Upload one to reuse across shots.
            </div>
        )
    }

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {elements.map((element) => (
                <div key={element.id} className="flex gap-3 rounded-2xl border border-white/10 bg-[#0b0b0d] p-3">
                    <div className="h-16 w-16 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                        {element.image_url ? (
                            <img src={element.image_url} alt={element.name} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-white/40">
                                <ImageIcon className="h-5 w-5" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm font-semibold text-white">{element.name}</p>
                        <p className="text-xs text-white/55">{element.type}</p>
                        {element.description ? (
                            <p className="mt-1 line-clamp-2 text-xs text-white/45">{element.description}</p>
                        ) : null}
                    </div>
                    <ElementDeleteButton projectId={projectId} elementId={element.id} />
                </div>
            ))}
        </div>
    )
}
