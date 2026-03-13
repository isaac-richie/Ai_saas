"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { deleteElement } from "@/core/actions/elements"
import { Button } from "@/interface/components/ui/button"

interface ElementDeleteButtonProps {
    projectId: string
    elementId: string
}

export function ElementDeleteButton({ projectId, elementId }: ElementDeleteButtonProps) {
    const router = useRouter()
    const [isDeleting, setIsDeleting] = useState(false)

    const handleDelete = async () => {
        if (!confirm("Delete this element?")) return
        setIsDeleting(true)
        const res = await deleteElement(projectId, elementId)
        setIsDeleting(false)
        if (res.error) {
            alert(`Delete failed: ${res.error}`)
            return
        }
        router.refresh()
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            className="text-white/65 hover:text-white"
            onClick={handleDelete}
            disabled={isDeleting}
        >
            <Trash2 className="h-4 w-4" />
        </Button>
    )
}
