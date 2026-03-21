"use client"

import { useMemo, useState, useEffect } from "react"
import { useForm, useWatch, Resolver } from "react-hook-form"
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
import { Checkbox } from "@/interface/components/ui/checkbox"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/interface/components/ui/card"
import { assemblePrompt, PROMPT_ORDER, PromptCategory, PromptPreset } from "@/core/utils/prompts/builder"
import { createShot } from "@/core/actions/shots"
import { attachElementToShot } from "@/core/actions/elements"
import { createPreset, deletePreset, getPresets } from "@/core/actions/presets"
import { Loader2, Plus, Sparkles, Layers } from "lucide-react"
import { toast } from "sonner"

const numericOptional = z.preprocess(
    (val) => {
        if (val === "" || val === null || val === undefined) return undefined
        const num = Number(val)
        return Number.isNaN(num) ? undefined : num
    },
    z.number().optional()
)

const numericOptionalZod = z.coerce.number().optional()

const shotSchema = z.object({
    subject: z.string().min(3, "Subject is required"),
    shot: z.string().optional(),
    angle: z.string().optional(),
    camera: z.string().optional(),
    lens: z.string().optional(),
    movement: z.string().optional(),
    lighting: z.string().optional(),
    timeOfDay: z.string().optional(),
    colorGrade: z.string().optional(),
    depthOfField: z.string().optional(),
    aspectRatio: z.string().optional(),
    genreMood: z.string().optional(),
    durationSeconds: numericOptionalZod,
    model: z.string().optional(),
    negativePrompt: z.string().optional(),
    seed: numericOptionalZod,
    seedLocked: z.boolean().optional(),
    cfgScale: numericOptionalZod,
    steps: numericOptionalZod,
    variations: numericOptionalZod,
})

type ShotFormValues = {
    subject: string
    shot?: string
    angle?: string
    camera?: string
    lens?: string
    movement?: string
    lighting?: string
    timeOfDay?: string
    colorGrade?: string
    depthOfField?: string
    aspectRatio?: string
    genreMood?: string
    durationSeconds?: number
    model?: string
    negativePrompt?: string
    seed?: number
    seedLocked?: boolean
    cfgScale?: number
    steps?: number
    variations?: number
}

type PresetData = Partial<Record<PromptCategory, string>>

type ShotPreset = {
    id: string
    name: string
    description: string | null
    data: PresetData
}

interface ShotBuilderProps {
    projectId: string
    sceneId: string
    onShotCreated?: () => void
}

type AvailableElement = {
    id: string
    name: string
}

type PresetOption = {
    id: string
    category: PromptCategory
    key: string
    label: string
    descriptor: string
    sort_order?: number
}

type PresetMap = Record<PromptCategory, PresetOption[]>

const CATEGORY_LABELS: Record<PromptCategory, string> = {
    shot: "Shot Size",
    angle: "Camera Angle",
    camera: "Camera Sensor",
    lens: "Lens Character",
    movement: "Camera Movement",
    lighting: "Lighting",
    timeOfDay: "Time of Day",
    colorGrade: "Color Grade",
    depthOfField: "Depth of Field",
    aspectRatio: "Aspect Ratio",
    genreMood: "Genre / Mood",
}

export function ShotBuilder({ projectId, sceneId, onShotCreated }: ShotBuilderProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [availableElements, setAvailableElements] = useState<AvailableElement[]>([])
    const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set())
    const [isMounted, setIsMounted] = useState(false)
    const [presets, setPresets] = useState<ShotPreset[]>([])
    const [isLoadingPresets, setIsLoadingPresets] = useState(true)
    const [isSavingPreset, setIsSavingPreset] = useState(false)
    const [newPresetName, setNewPresetName] = useState("")
    const [newPresetDescription, setNewPresetDescription] = useState("")
    const [presetOptions, setPresetOptions] = useState<PresetMap | null>(null)
    const [loadingOptions, setLoadingOptions] = useState(true)
    const draftStorageKey = `shot-builder-draft:${sceneId}`

    useEffect(() => {
        setIsMounted(true)
    }, [])

    useEffect(() => {
        let active = true
        fetch("/api/shot-options")
            .then((res) => res.json())
            .then((data) => {
                if (!active) return
                setPresetOptions(data.data || null)
            })
            .catch(() => {
                if (active) setPresetOptions(null)
            })
            .finally(() => {
                if (active) setLoadingOptions(false)
            })
        return () => {
            active = false
        }
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


    const form = useForm<ShotFormValues>({
        resolver: zodResolver(shotSchema) as unknown as Resolver<ShotFormValues>,
        defaultValues: {
            subject: "",
            durationSeconds: 5,
            seedLocked: true,
            variations: 1,
        },
    })

    const handleOptionalSelect = (value: string, onChange: (value: string | undefined) => void) => {
        onChange(value === "__none__" ? undefined : value)
    }

    const watchedValues = useWatch({ control: form.control })

    useEffect(() => {
        if (!isMounted) return
        try {
            const raw = window.localStorage.getItem(draftStorageKey)
            if (!raw) return
            const parsed = JSON.parse(raw) as Partial<ShotFormValues>
            form.reset({
                subject: parsed.subject ?? "",
                shot: parsed.shot,
                angle: parsed.angle,
                camera: parsed.camera,
                lens: parsed.lens,
                movement: parsed.movement,
                lighting: parsed.lighting,
                timeOfDay: parsed.timeOfDay,
                colorGrade: parsed.colorGrade,
                depthOfField: parsed.depthOfField,
                aspectRatio: parsed.aspectRatio,
                genreMood: parsed.genreMood,
                durationSeconds: parsed.durationSeconds ?? 5,
                model: parsed.model,
                negativePrompt: parsed.negativePrompt,
                seed: parsed.seed,
                seedLocked: parsed.seedLocked ?? true,
                cfgScale: parsed.cfgScale,
                steps: parsed.steps,
                variations: parsed.variations ?? 1,
            })
        } catch {
            // Ignore malformed local draft payloads.
        }
    }, [draftStorageKey, form, isMounted])

    useEffect(() => {
        if (!isMounted) return
        try {
            window.localStorage.setItem(draftStorageKey, JSON.stringify(watchedValues))
        } catch {
            // Ignore quota/storage write failures.
        }
    }, [draftStorageKey, isMounted, watchedValues])

    const selections = useMemo(() => {
        const map: Partial<Record<PromptCategory, PromptPreset>> = {}
        if (!presetOptions) return map
        for (const category of PROMPT_ORDER) {
            const raw = watchedValues[category as keyof ShotFormValues]
            const key = typeof raw === "string" ? raw : undefined
            if (!key) continue
            const preset = presetOptions[category]?.find((item) => item.key === key)
            if (preset) {
                map[category] = {
                    key: preset.key,
                    label: preset.label,
                    descriptor: preset.descriptor,
                }
            }
        }
        return map
    }, [presetOptions, watchedValues])

    const promptPreview = useMemo(() => {
        return assemblePrompt({
            subject: watchedValues.subject || "",
            selections,
        })
    }, [watchedValues.subject, selections])

    const buildPresetData = (values: ShotFormValues): PresetData => {
        const data: PresetData = {}
        PROMPT_ORDER.forEach((category) => {
            const raw = values[category as keyof ShotFormValues]
            const value = typeof raw === "string" ? raw : undefined
            if (value) data[category] = value
        })
        return data
    }

    const applyPreset = (preset: ShotPreset) => {
        const data = preset.data || {}
        PROMPT_ORDER.forEach((category) => {
            const value = data[category]
            if (value) form.setValue(category, value)
        })
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

        const shotLabel = selections.shot?.label || "Shot"
        const name = `${shotLabel} of ${data.subject.substring(0, 20)}...`

        const selectionPayload = {
            subject: data.subject,
            selections,
        }

        const generationSettings = {
            aspect_ratio: selections.aspectRatio?.label || data.aspectRatio || undefined,
            duration_seconds: data.durationSeconds ? Number(data.durationSeconds) : undefined,
            model: data.model?.trim() || undefined,
            negative_prompt: data.negativePrompt?.trim() || undefined,
            seed: data.seed !== undefined ? Number(data.seed) : undefined,
            seed_locked: Boolean(data.seedLocked),
            cfg_scale: data.cfgScale !== undefined ? Number(data.cfgScale) : undefined,
            steps: data.steps !== undefined ? Number(data.steps) : undefined,
            variations: data.variations !== undefined ? Number(data.variations) : undefined,
        }

        const formData = new FormData()
        formData.append("name", name)
        formData.append("description", data.subject)
        formData.append("shot_type", selections.shot?.label || "")
        formData.append("camera_movement", selections.movement?.label || "")
        formData.append("estimated_duration", String(data.durationSeconds || 0))
        formData.append("generation_settings", JSON.stringify(generationSettings))
        formData.append("prompt_text", promptPreview)
        formData.append("selection_payload", JSON.stringify(selectionPayload))

        const res = await createShot(sceneId, formData)

        if (!res.error && res.data) {
            for (const elId of Array.from(selectedElementIds)) {
                await attachElementToShot(res.data.id, elId)
            }

        }

        setIsSaving(false)
        if (res.error) {
            toast.error(`Error creating shot: ${res.error}`)
        } else {
            toast.success("Shot created successfully!")
            // Keep the current prompt/choices until user manually clears or refreshes.
            form.setValue("subject", data.subject)
            setSelectedElementIds(new Set())
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
                                name="subject"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-white/80">Subject / Action</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="A lone astronaut on a red planet..."
                                                className="resize-none rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {loadingOptions ? (
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
                                    Loading presets...
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {PROMPT_ORDER.map((category) => (
                                        <FormField
                                            key={category}
                                            control={form.control}
                                            name={category}
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-white/80">{CATEGORY_LABELS[category]}</FormLabel>
                                                    <Select
                                                        onValueChange={(value) => handleOptionalSelect(value, field.onChange)}
                                                        value={field.value ?? undefined}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="rounded-xl border-white/10 bg-white/5 text-white">
                                                                <SelectValue placeholder={`Select ${CATEGORY_LABELS[category].toLowerCase()}`} />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                            <SelectItem value="__none__">Clear</SelectItem>
                                                            {(presetOptions?.[category] || []).map((option) => (
                                                                <SelectItem key={option.id} value={option.key}>
                                                                    {option.label}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                    ))}
                                </div>
                            )}

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

                            <div className="space-y-3 border-t border-white/10 pt-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-white/80">Advanced Controls</div>
                                        <p className="text-xs text-white/45">Aspect ratio, model, seed lock, and quality tuning.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                        control={form.control}
                                        name="durationSeconds"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white/80">Duration (sec)</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={60}
                                                        value={field.value ?? ""}
                                                        onChange={(event) =>
                                                            field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                                                        }
                                                        className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="model"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Model (optional)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="e.g. dall-e-3"
                                                    value={field.value ?? ""}
                                                    onChange={(event) => field.onChange(event.target.value)}
                                                    className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="negativePrompt"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-white/80">Negative Prompt</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                    placeholder="Avoid clutter, distorted faces, oversaturated neon..."
                                                    className="resize-none rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                    value={field.value ?? ""}
                                                    onChange={(event) => field.onChange(event.target.value)}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                        control={form.control}
                                        name="seed"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white/80">Seed</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        value={field.value ?? ""}
                                                        onChange={(event) =>
                                                            field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                                                        }
                                                        className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="variations"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white/80">Variations</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={6}
                                                        value={field.value ?? ""}
                                                        onChange={(event) =>
                                                            field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                                                        }
                                                        className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <FormField
                                        control={form.control}
                                        name="cfgScale"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white/80">CFG Scale</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={0}
                                                        max={30}
                                                        value={field.value ?? ""}
                                                        onChange={(event) =>
                                                            field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                                                        }
                                                        className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="steps"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-white/80">Steps</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={200}
                                                        value={field.value ?? ""}
                                                        onChange={(event) =>
                                                            field.onChange(event.target.value === "" ? undefined : Number(event.target.value))
                                                        }
                                                        className="rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35"
                                                    />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </div>

                                <FormField
                                    control={form.control}
                                    name="seedLocked"
                                    render={({ field }) => (
                                        <FormItem className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                            <div>
                                                <FormLabel className="text-white/80">Lock Seed</FormLabel>
                                                <p className="text-xs text-white/45">Keep seed consistent across variations.</p>
                                            </div>
                                            <FormControl>
                                                <Checkbox
                                                    checked={field.value ?? false}
                                                    onCheckedChange={(value) => field.onChange(Boolean(value))}
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
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
                            Descriptors are assembled in the exact order required for cinematic prompts.
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
                                disabled={isSavingPreset || !newPresetName.trim()}
                                className="w-full rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
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
