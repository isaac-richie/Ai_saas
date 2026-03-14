"use client"

import { useMemo, useState, useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/interface/components/ui/button"
import { Textarea } from "@/interface/components/ui/textarea"
import { Input } from "@/interface/components/ui/input"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/interface/components/ui/form"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/interface/components/ui/select"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { generatePrompt, ShotParams } from "@/core/utils/prompts/builder"
import { createShot } from "@/core/actions/shots"
import { attachElementToShot } from "@/core/actions/elements"
import { createPreset, deletePreset, getPresets } from "@/core/actions/presets"
import { addShotReference } from "@/core/actions/references"
import { Loader2, Plus, Sparkles, Layers } from "lucide-react"
import { toast } from "sonner"

const shotSchema = z.object({
    description: z.string().min(3, "Description is required"),
    shotSize: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional(),
    camera: z.string().optional(),
    lens: z.string().optional(),
    lighting: z.string().optional(),
})

type ShotFormValues = z.infer<typeof shotSchema>

type PresetData = {
    shotSize?: string
    angle?: string
    movement?: string
    camera?: string
    lens?: string
    lighting?: string
}

type ShotPreset = {
    id: string
    name: string
    description: string | null
    data: PresetData
}

interface ShotBuilderProps {
    projectId: string
    sceneId: string
    cameras: { id: string; name: string }[]
    lenses: { id: string; name: string }[]
    onShotCreated?: () => void
}

type AvailableElement = {
    id: string
    name: string
}

export function ShotBuilder({ projectId, sceneId, cameras, lenses, onShotCreated }: ShotBuilderProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [availableElements, setAvailableElements] = useState<AvailableElement[]>([])
    const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set())
    const [isMounted, setIsMounted] = useState(false)
    const [presets, setPresets] = useState<ShotPreset[]>([])
    const [isLoadingPresets, setIsLoadingPresets] = useState(true)
    const [isSavingPreset, setIsSavingPreset] = useState(false)
    const [newPresetName, setNewPresetName] = useState("")
    const [newPresetDescription, setNewPresetDescription] = useState("")
    const [referenceInput, setReferenceInput] = useState("")
    const [referenceUrls, setReferenceUrls] = useState<string[]>([])

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Fetch elements on mount
    useEffect(() => {
        let isMounted = true

        import("@/core/actions/elements").then(({ getProjectElements }) => {
            getProjectElements(projectId).then((res) => {
                if (isMounted && res.data) {
                    setAvailableElements(res.data)
                }
            })
        })

        return () => {
            isMounted = false
        }
    }, [projectId])

    const loadPresets = async () => {
        setIsLoadingPresets(true)
        const res = await getPresets()
        if (res.error) {
            toast.error(`Error loading presets: ${res.error}`)
        }
        setPresets((res.data || []) as ShotPreset[])
        setIsLoadingPresets(false)
    }

    useEffect(() => {
        loadPresets()
    }, [])

    const toggleElement = (id: string) => {
        const newSet = new Set(selectedElementIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedElementIds(newSet)
    }

    const addReferenceUrl = () => {
        const trimmed = referenceInput.trim()
        if (!trimmed) return
        if (referenceUrls.includes(trimmed)) {
            toast.error("Reference already added")
            return
        }
        setReferenceUrls((prev) => [...prev, trimmed])
        setReferenceInput("")
    }

    const removeReferenceUrl = (url: string) => {
        setReferenceUrls((prev) => prev.filter((item) => item !== url))
    }

    const form = useForm<ShotFormValues>({
        resolver: zodResolver(shotSchema),
        defaultValues: {
            description: "",
            shotSize: "Medium Shot",
            angle: "Eye Level",
            movement: "Static",
            lighting: "Natural Lighting",
            camera: cameras[0]?.id,
            lens: lenses[0]?.id,
        },
    })

    const handleOptionalSelect = (value: string, onChange: (value: string | undefined) => void) => {
        onChange(value === "__none__" ? undefined : value)
    }

    const watchedValues = useWatch({ control: form.control })

    const promptPreview = useMemo(() => {
        const cameraName = cameras.find((c) => c.id === watchedValues.camera)?.name
        const lensName = lenses.find((l) => l.id === watchedValues.lens)?.name

        const params: ShotParams = {
            description: watchedValues.description || "",
            shotSize: watchedValues.shotSize,
            angle: watchedValues.angle,
            movement: watchedValues.movement,
            lighting: watchedValues.lighting,
            camera: cameraName,
            lens: lensName,
        }

        return generatePrompt(params)
    }, [watchedValues, cameras, lenses])

    const buildPresetData = (values: ShotFormValues): PresetData => ({
        shotSize: values.shotSize,
        angle: values.angle,
        movement: values.movement,
        camera: values.camera,
        lens: values.lens,
        lighting: values.lighting,
    })

    const applyPreset = (preset: ShotPreset) => {
        const data = preset.data || {}
        if (data.shotSize) form.setValue("shotSize", data.shotSize)
        if (data.angle) form.setValue("angle", data.angle)
        if (data.movement) form.setValue("movement", data.movement)
        if (data.camera) form.setValue("camera", data.camera)
        if (data.lens) form.setValue("lens", data.lens)
        if (data.lighting) form.setValue("lighting", data.lighting)
        toast.success(`Applied preset: ${preset.name}`)
    }

    const handleSavePreset = async () => {
        if (!newPresetName.trim()) {
            toast.error("Preset name is required")
            return
        }

        setIsSavingPreset(true)
        const values = form.getValues()
        const res = await createPreset(
            newPresetName.trim(),
            newPresetDescription.trim() ? newPresetDescription.trim() : null,
            buildPresetData(values)
        )

        setIsSavingPreset(false)

        if (res.error) {
            toast.error(`Error saving preset: ${res.error}`)
            return
        }

        setNewPresetName("")
        setNewPresetDescription("")
        await loadPresets()
        toast.success("Preset saved")
    }

    const handleDeletePreset = async (id: string) => {
        const res = await deletePreset(id)
        if (res.error) {
            toast.error(`Error deleting preset: ${res.error}`)
            return
        }
        setPresets((prev) => prev.filter((preset) => preset.id !== id))
        toast.success("Preset removed")
    }

    async function onSubmit(data: ShotFormValues) {
        setIsSaving(true)

        const name = `${data.shotSize || "Shot"} of ${data.description.substring(0, 20)}...`

        const formData = new FormData()
        formData.append("name", name)
        formData.append("description", data.description)
        formData.append("shot_type", data.shotSize || "")
        formData.append("camera_movement", data.movement || "")
        if (data.camera) formData.append("camera_id", data.camera)
        if (data.lens) formData.append("lens_id", data.lens)

        const res = await createShot(sceneId, formData)

        if (!res.error && res.data) {
            // Attach selected elements
            for (const elId of Array.from(selectedElementIds)) {
                await attachElementToShot(res.data.id, elId) // res.data needs to return the shot in createShot
            }

            for (const url of referenceUrls) {
                await addShotReference(res.data.id, url, "image")
            }
        }

        setIsSaving(false)
        if (res.error) {
            toast.error(`Error creating shot: ${res.error}`)
        } else {
            toast.success("Shot created successfully!")
            form.reset({
                description: "",
                shotSize: "Medium Shot",
                angle: "Eye Level",
                movement: "Static",
                lighting: "Natural Lighting",
                camera: cameras[0]?.id,
                lens: lenses[0]?.id,
            })
            setSelectedElementIds(new Set())
            setReferenceUrls([])
            setReferenceInput("")
            onShotCreated?.()
        }
    }

    if (!isMounted) {
        return (
            <div className="grid gap-4 md:grid-cols-2">
                <div className="min-h-[400px] rounded-2xl border border-white/10 bg-[#0b0b0d] animate-pulse" />
                <div className="min-h-[150px] rounded-2xl border border-white/10 bg-[#0b0b0d] animate-pulse" />
            </div>
        )
    }

    return (
        <div className="grid gap-4 md:grid-cols-2">
            <Card className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg tracking-tight">Shot Attributes</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-white/80">Subject / Action</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="A cyberpunk detective walking in the rain..."
                                                className="resize-none rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <FormField
                                    control={form.control}
                                    name="shotSize"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Shot Size</FormLabel>
                                            <Select onValueChange={(value) => handleOptionalSelect(value, field.onChange)} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                        <SelectValue placeholder="Select size" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                    <SelectItem value="__none__">Clear</SelectItem>
                                                    <SelectItem value="Extreme Wide Shot">Extreme Wide Shot</SelectItem>
                                                    <SelectItem value="Wide Shot">Wide Shot</SelectItem>
                                                    <SelectItem value="Medium Shot">Medium Shot</SelectItem>
                                                    <SelectItem value="Close-up">Close-up</SelectItem>
                                                    <SelectItem value="Extreme Close-up">Extreme Close-up</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="angle"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Angle</FormLabel>
                                            <Select onValueChange={(value) => handleOptionalSelect(value, field.onChange)} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                        <SelectValue placeholder="Select angle" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                    <SelectItem value="__none__">Clear</SelectItem>
                                                    <SelectItem value="Eye Level">Eye Level</SelectItem>
                                                    <SelectItem value="Low Angle">Low Angle</SelectItem>
                                                    <SelectItem value="High Angle">High Angle</SelectItem>
                                                    <SelectItem value="Overhead">Overhead</SelectItem>
                                                    <SelectItem value="Dutch Angle">Dutch Angle</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="camera"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Camera</FormLabel>
                                            <Select onValueChange={(value) => handleOptionalSelect(value, field.onChange)} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                        <SelectValue placeholder="Select camera" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                    <SelectItem value="__none__">Clear</SelectItem>
                                                    {cameras.map((camera) => (
                                                        <SelectItem key={camera.id} value={camera.id}>{camera.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="lens"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Lens</FormLabel>
                                            <Select onValueChange={(value) => handleOptionalSelect(value, field.onChange)} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                        <SelectValue placeholder="Select lens" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                    <SelectItem value="__none__">Clear</SelectItem>
                                                    {lenses.map((lens) => (
                                                        <SelectItem key={lens.id} value={lens.id}>{lens.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <FormField
                                    control={form.control}
                                    name="movement"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Movement</FormLabel>
                                            <Select onValueChange={(value) => handleOptionalSelect(value, field.onChange)} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                        <SelectValue placeholder="Select movement" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                    <SelectItem value="__none__">Clear</SelectItem>
                                                    <SelectItem value="Static">Static</SelectItem>
                                                    <SelectItem value="Handheld">Handheld</SelectItem>
                                                    <SelectItem value="Dolly In">Dolly In</SelectItem>
                                                    <SelectItem value="Dolly Out">Dolly Out</SelectItem>
                                                    <SelectItem value="Pan Right">Pan Right</SelectItem>
                                                    <SelectItem value="Pan Left">Pan Left</SelectItem>
                                                    <SelectItem value="Tilt Up">Tilt Up</SelectItem>
                                                    <SelectItem value="Tilt Down">Tilt Down</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="lighting"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Lighting</FormLabel>
                                            <Select onValueChange={(value) => handleOptionalSelect(value, field.onChange)} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                        <SelectValue placeholder="Select lighting" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                    <SelectItem value="__none__">Clear</SelectItem>
                                                    <SelectItem value="Natural Lighting">Natural Lighting</SelectItem>
                                                    <SelectItem value="Golden Hour">Golden Hour</SelectItem>
                                                    <SelectItem value="Blue Hour">Blue Hour</SelectItem>
                                                    <SelectItem value="Studio Lighting">Studio Lighting</SelectItem>
                                                    <SelectItem value="Cinematic">Cinematic</SelectItem>
                                                    <SelectItem value="Neon Noir">Neon Noir</SelectItem>
                                                    <SelectItem value="Rembrandt">Rembrandt</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {/* Elements Selection logic */}
                            {availableElements.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-white/10">
                                    <label className="text-sm font-medium text-white/80 flex items-center">
                                        <Layers className="h-4 w-4 mr-2" /> Reference Elements
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableElements.map(el => (
                                            <button
                                                key={el.id}
                                                type="button"
                                                onClick={() => toggleElement(el.id)}
                                                className={`px-3 py-1.5 text-xs rounded-full border transition ${selectedElementIds.has(el.id)
                                                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                                                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                                    }`}
                                            >
                                                {el.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2 pt-2 border-t border-white/10">
                                <label className="text-sm font-medium text-white/80">
                                    Shot References (URLs)
                                </label>
                                <div className="flex gap-2">
                                    <Input
                                        value={referenceInput}
                                        onChange={(e) => setReferenceInput(e.target.value)}
                                        placeholder="https://example.com/reference.jpg"
                                        className="flex-1 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                    />
                                    <Button
                                        type="button"
                                        onClick={addReferenceUrl}
                                        className="rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
                                    >
                                        Add
                                    </Button>
                                </div>
                                {referenceUrls.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {referenceUrls.map((url) => (
                                            <button
                                                key={url}
                                                type="button"
                                                onClick={() => removeReferenceUrl(url)}
                                                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60 hover:bg-white/10"
                                                title="Remove reference"
                                            >
                                                {url}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button type="submit" disabled={isSaving} className="w-full rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15">
                                {isSaving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Shot
                                    </>
                                )}
                            </Button>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <Card className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                    <CardHeader>
                        <CardTitle className="flex items-center text-sm font-medium uppercase tracking-wider text-white/55">
                            <Sparkles className="mr-2 h-4 w-4 text-white/45" />
                            Prompt Preview
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 font-mono text-sm leading-relaxed text-white/80">
                            {promptPreview || <span className="italic text-white/45">Start building your shot...</span>}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-white/50">
                            This prompt will be sent to the AI image generator.
                        </p>
                    </CardFooter>
                </Card>

                <Card className="rounded-2xl border border-white/10 bg-[#0b0b0d] text-white shadow-[0_20px_40px_-35px_rgba(0,0,0,0.9)]">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium uppercase tracking-wider text-white/55">
                            Shot Presets
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="grid gap-2">
                            <Input
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                placeholder="Preset name"
                                className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                            />
                            <Input
                                value={newPresetDescription}
                                onChange={(e) => setNewPresetDescription(e.target.value)}
                                placeholder="Description (optional)"
                                className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                            />
                            <Button
                                type="button"
                                onClick={handleSavePreset}
                                disabled={isSavingPreset}
                                className="w-full rounded-xl border border-white/10 bg-white/10 text-white hover:bg-white/15"
                            >
                                {isSavingPreset ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Save Current Preset
                                    </>
                                )}
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {isLoadingPresets && (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
                                    Loading presets...
                                </div>
                            )}
                            {!isLoadingPresets && presets.length === 0 && (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
                                    No presets yet. Save your first setup.
                                </div>
                            )}
                            {presets.map((preset) => (
                                <div
                                    key={preset.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                                >
                                    <div>
                                        <div className="text-sm text-white/90">{preset.name}</div>
                                        {preset.description && (
                                            <div className="text-xs text-white/45">{preset.description}</div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => applyPreset(preset)}
                                            className="rounded-full border border-white/10 bg-white/10 px-3 text-xs text-white hover:bg-white/15"
                                        >
                                            Apply
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDeletePreset(preset.id)}
                                            className="rounded-full border border-transparent text-xs text-white/50 hover:bg-white/10 hover:text-white"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
