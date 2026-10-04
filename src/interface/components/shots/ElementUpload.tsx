/* eslint-disable @next/next/no-img-element */
"use client"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { UploadCloud, Loader2, X, Sparkles } from "lucide-react"
import { uploadFrameImage } from "@/interface/components/fast-video/frame-capture"
import { referenceClassificationSchema } from "@/core/validation/storyboard-direction"
import { Button } from "@/interface/components/ui/button"
import { Input } from "@/interface/components/ui/input"
import { Textarea } from "@/interface/components/ui/textarea"
import { createElement } from "@/core/actions/elements"
import { toast } from "sonner"

interface ElementUploadProps {
    projectId: string
    onUploadSuccess?: () => void
}

export function ElementUpload({ projectId, onUploadSuccess }: ElementUploadProps) {
    const [file, setFile] = useState<File | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [name, setName] = useState("")
    const [type, setType] = useState("character") // default
    const [description, setDescription] = useState("")
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [isReading, setIsReading] = useState(false)
    const [isOver, setIsOver] = useState(false)
    const router = useRouter()

    const TYPES = [
        { value: "character", label: "Character" },
        { value: "prop", label: "Product / prop" },
        { value: "location", label: "Location" },
        { value: "clothing", label: "Clothing" },
    ] as const
    const TYPE_FROM_ROLE: Record<string, string> = { character: "character", product: "prop", prop: "prop", location: "location", wardrobe: "clothing", style: "prop" }

    // Fills name, type and description from the image. Optional: any failure leaves the fields for the user.
    const autoTag = async (picked: File) => {
        setIsReading(true)
        try {
            const assetPath = await uploadFrameImage(picked)
            const response = await fetch("/api/storyboard/classify-reference", {
                method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(50_000),
                body: JSON.stringify({ assetPath, fileName: picked.name.slice(0, 180) }),
            })
            const body = await response.json().catch(() => ({}))
            const tag = response.ok ? referenceClassificationSchema.safeParse(body.classification).data : undefined
            if (!tag) return
            setName((current) => current || tag.label)
            setType(TYPE_FROM_ROLE[tag.role] ?? "character")
            setDescription((current) => current || tag.description)
        } catch {
            // Tagging is a convenience; the upload itself still works.
        } finally {
            setIsReading(false)
        }
    }

    const pickFile = (picked: File | undefined) => {
        if (!picked) return
        if (!["image/jpeg", "image/png", "image/webp"].includes(picked.type)) { toast.error("Use a JPG, PNG or WebP image."); return }
        setFile(picked)
        setPreviewUrl(URL.createObjectURL(picked))
        void autoTag(picked)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => pickFile(e.target.files?.[0])

    const clearFile = () => {
        setFile(null)
        setPreviewUrl(null)
        if (fileInputRef.current) fileInputRef.current.value = ""
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!file || !name || !type) return

        setIsUploading(true)
        try {
            // 1. Upload file to Supabase Storage via our API route
            const formData = new FormData()
            formData.append("file", file)

            const uploadRes = await fetch("/api/upload", {
                method: "POST",
                body: formData
            })
            const uploadData = await uploadRes.json()

            if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed")

            // 2. Save Element record to DB
            const dbFormData = new FormData()
            dbFormData.append("name", name)
            dbFormData.append("type", type)
            dbFormData.append("image_url", uploadData.url)
            dbFormData.append("description", description)
            dbFormData.append("project_id", projectId)

            const dbRes = await createElement(dbFormData)
            if (dbRes?.error) throw new Error(dbRes.error)

            // Reset
            setName("")
            setDescription("")
            clearFile()
            toast.success("Element uploaded successfully!")
            router.refresh()
            onUploadSuccess?.()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Upload failed"
            toast.error(`Error: ${message}`)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <form id="project-references" onSubmit={handleSubmit} className="scroll-mt-24 space-y-3 rounded-2xl lux-glass lux-hairline p-4 text-white">
            <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-white/55">Project references</h3>
                <p className="mt-1 text-xs text-white/40">Characters, products and places you reuse across shots.</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleFileSelect} />
            {previewUrl ? (
                <div className="relative overflow-hidden rounded-xl border border-gold-400/20">
                    <img src={previewUrl} alt="Reference preview" className="aspect-[4/3] w-full object-cover" />
                    <button type="button" onClick={clearFile} aria-label="Remove image" className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/60 text-white/80 backdrop-blur hover:text-white">
                        <X className="h-3.5 w-3.5" />
                    </button>
                    {isReading ? (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1 text-[10.5px] text-gold-100 backdrop-blur">
                            <Loader2 className="h-3 w-3 animate-spin" />Reading the image…
                        </span>
                    ) : null}
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => { event.preventDefault(); setIsOver(true) }}
                    onDragLeave={() => setIsOver(false)}
                    onDrop={(event) => { event.preventDefault(); setIsOver(false); pickFile(event.dataTransfer.files?.[0]) }}
                    className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition ${isOver ? "border-gold-300/70 bg-gold-400/[0.08]" : "border-gold-400/25 bg-white/[0.02] hover:border-gold-300/50"}`}
                >
                    <UploadCloud className="h-5 w-5 text-gold-200/80" />
                    <span className="text-[12.5px] text-white/80">Drop an image or click to browse</span>
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-white/40"><Sparkles className="h-3 w-3" />Name and type are filled in for you</span>
                </button>
            )}
            <div role="radiogroup" aria-label="Reference type" className="flex flex-wrap gap-1.5">
                {TYPES.map((item) => (
                    <button key={item.value} type="button" role="radio" aria-checked={type === item.value} onClick={() => setType(item.value)}
                        className={`h-7 rounded-full border px-2.5 text-[11px] transition ${type === item.value ? "border-gold-300/45 bg-gold-400/15 text-gold-50" : "border-gold-400/[0.14] text-white/60 hover:text-white/90"}`}>
                        {item.label}
                    </button>
                ))}
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Alex" className="studio-field h-9 rounded-xl text-white placeholder:text-white/35" />
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details to keep consistent (optional)" className="studio-field min-h-16 rounded-xl text-[12px] text-white placeholder:text-white/35" />
            <Button type="submit" variant="studio" disabled={!file || !name.trim() || isUploading} className="h-10 w-full rounded-xl font-semibold">
                {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                {isUploading ? "Saving…" : "Save to project"}
            </Button>
        </form>
    )
}
