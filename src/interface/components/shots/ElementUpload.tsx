/* eslint-disable @next/next/no-img-element */
"use client"
import { useState, useRef } from "react"
import { UploadCloud, Loader2, X } from "lucide-react"
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

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (selectedFile) {
            setFile(selectedFile)
            const url = URL.createObjectURL(selectedFile)
            setPreviewUrl(url)
        }
    }

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
            onUploadSuccess?.()
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Upload failed"
            toast.error(`Error: ${message}`)
        } finally {
            setIsUploading(false)
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-white/10 bg-[#0b0b0d] p-5">
            <h3 className="text-sm font-semibold text-white">Upload New Reference Element</h3>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                    <div>
                        <label className="text-xs text-white/70">Name</label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Cyberpunk Detective Outfit"
                            required
                            className="mt-1 border-white/10 bg-white/5 text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-white/70">Type</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="w-full mt-1 rounded-md border border-white/10 bg-white/5 p-2 text-sm text-white focus:outline-none"
                        >
                            <option value="character">Character</option>
                            <option value="prop">Prop</option>
                            <option value="location">Location / Environment</option>
                            <option value="clothing">Clothing</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs text-white/70">Description (Optional)</label>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g. wearing a glowing neon trenchcoat"
                            className="mt-1 resize-none border-white/10 bg-white/5 text-white"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs text-white/70">Reference Image</label>
                    <div className="mt-1 relative flex h-[180px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15 bg-white/5 hover:bg-white/10 transition cursor-pointer overflow-hidden">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            accept="image/*"
                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        {previewUrl ? (
                            <>
                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); clearFile(); }}
                                    className="absolute top-2 right-2 z-20 rounded-full bg-black/60 p-1 text-white hover:bg-black"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </>
                        ) : (
                            <div className="flex flex-col items-center text-white/50">
                                <UploadCloud className="mb-2 h-8 w-8" />
                                <span className="text-xs">Click or drag image</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Button
                type="submit"
                disabled={isUploading || !file || !name}
                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
            >
                {isUploading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</>
                ) : (
                    "Upload Element"
                )}
            </Button>
        </form>
    )
}
