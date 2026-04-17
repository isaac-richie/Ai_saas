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
import { StudioAdPanel } from "@/interface/components/shots/StudioAdPanel"
import { Loader2, Plus, Sparkles, Layers, Copy } from "lucide-react"
import { toast } from "sonner"

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
    providerSlug: z.enum(["auto", "openai", "kie"]).optional(),
    model: z.string().optional(),
    quality: z.string().optional(),
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
    providerSlug?: "auto" | "openai" | "kie"
    model?: string
    quality?: string
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

const QUICK_STYLE_PRESETS: Array<{
    id: string
    name: string
    hints: Partial<Record<PromptCategory, string[]>>
}> = [
        {
            id: "noir",
            name: "Noir",
            hints: {
                lighting: ["noir", "hard", "contrast", "shadow"],
                colorGrade: ["noir", "monochrome", "b&w", "black", "desatur"],
                camera: ["arri", "cinema"],
            },
        },
        {
            id: "anamorphic",
            name: "Anamorphic",
            hints: {
                lens: ["anamorphic", "scope", "cinema"],
                aspectRatio: ["21:9", "2.39", "16:9"],
                colorGrade: ["cinematic", "film"],
            },
        },
        {
            id: "golden-hour",
            name: "Golden Hour",
            hints: {
                lighting: ["golden", "sunset", "warm"],
                colorGrade: ["warm", "amber", "kodak", "portra"],
                timeOfDay: ["sunset", "dusk", "golden"],
            },
        },
    ]

    const copyToClipboard = async (text: string, label: string) => {
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            toast.success(`${label} copied to clipboard`)
        } catch {
            toast.error("Failed to copy to clipboard")
        }
    }

export function ShotBuilder({ projectId, sceneId, onShotCreated }: ShotBuilderProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [availableElements, setAvailableElements] = useState<AvailableElement[]>([])
    const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set())
    const [isMounted, setIsMounted] = useState(false)
    const [presets, setPresets] = useState<ShotPreset[]>([])
    const [isLoadingPresets, setIsLoadingPresets] = useState(true)
    const [isSavingPreset, setIsSavingPreset] = useState(false)
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
    const [isPresetManagerOpen, setIsPresetManagerOpen] = useState(false)
    const [newPresetName, setNewPresetName] = useState("")
    const [newPresetDescription, setNewPresetDescription] = useState("")
    const [presetOptions, setPresetOptions] = useState<PresetMap | null>(null)
    const [loadingOptions, setLoadingOptions] = useState(true)

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
            providerSlug: "auto",
            quality: "standard",
            seedLocked: true,
            variations: 1,
        },
    })

    const handleOptionalSelect = (value: string, onChange: (value: string | undefined) => void) => {
        onChange(value === "__none__" ? undefined : value)
    }

    const applyQuickStyle = (styleId: string) => {
        if (!presetOptions) {
            toast.error("Presets are still loading")
            return
        }

        const style = QUICK_STYLE_PRESETS.find((item) => item.id === styleId)
        if (!style) return

        Object.entries(style.hints).forEach(([category, hints]) => {
            if (!hints || hints.length === 0) return
            const typedCategory = category as PromptCategory
            const options = presetOptions[typedCategory] || []
            const match = options.find((option) => {
                const haystack = `${option.label} ${option.descriptor}`.toLowerCase()
                return hints.some((hint) => haystack.includes(hint.toLowerCase()))
            })
            if (match) {
                form.setValue(typedCategory, match.key)
            }
        })

        toast.success(`Applied ${style.name} quick style`)
    }

    const clearAllFields = () => {
        const resetValues: ShotFormValues = {
            subject: "",
            shot: undefined,
            angle: undefined,
            camera: undefined,
            lens: undefined,
            movement: undefined,
            lighting: undefined,
            timeOfDay: undefined,
            colorGrade: undefined,
            depthOfField: undefined,
            aspectRatio: undefined,
            genreMood: undefined,
            providerSlug: "auto",
            model: undefined,
            quality: "standard",
            negativePrompt: undefined,
            seed: undefined,
            seedLocked: true,
            cfgScale: undefined,
            steps: undefined,
            variations: 1,
        }
        form.reset(resetValues)
        setSelectedElementIds(new Set())
        toast.success("Shot builder cleared")
    }

    const watchedValues = useWatch({ control: form.control })
    const selectedProvider = watchedValues.providerSlug || "auto"

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
        const subject = (watchedValues.subject || "").trim()
        if (!subject) return ""
        return assemblePrompt({
            subject,
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

    const handleApplyAdPacket = ({
        packet,
        providerTarget,
        promptOverride,
    }: {
        packet: {
            masterPrompt: string
            negativePrompt: string
        }
        providerTarget: "openai" | "runway" | "kie"
        outputType: "image" | "video"
        promptOverride?: string
    }) => {
        form.setValue("subject", promptOverride || packet.masterPrompt)
        form.setValue("negativePrompt", packet.negativePrompt)

        if (providerTarget === "openai" || providerTarget === "kie") {
            form.setValue("providerSlug", providerTarget)
        } else {
            form.setValue("providerSlug", "auto")
        }

        toast.success("Assistant Director prompt applied to builder")
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
            provider_slug: data.providerSlug && data.providerSlug !== "auto" ? data.providerSlug : undefined,
            model: data.model?.trim() || undefined,
            quality: data.quality?.trim() || undefined,
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
        formData.append("estimated_duration", "5")
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
            <div className="flex flex-col gap-5 min-w-0">
                <div className="min-h-[400px] rounded-2xl border border-white/10 bg-[#0b0b0d] animate-pulse" />
                <div className="min-h-[150px] rounded-2xl border border-white/10 bg-[#0b0b0d] animate-pulse" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 min-w-0 2xl:gap-8">
            <Card className="studio-card rounded-2xl text-white">
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
                                        <div className="flex items-center justify-between">
                                            <FormLabel className="text-white/80">Subject / Action</FormLabel>
                                            <Button
                                                type="button"
                                                size="xs"
                                                variant="studioGhost"
                                                onClick={() => copyToClipboard(field.value, "Prompt input")}
                                                className="h-6 gap-1 rounded-lg px-2 text-[10px] text-white/40 hover:text-white"
                                            >
                                                <Copy className="h-3 w-3" />
                                                Copy
                                            </Button>
                                        </div>
                                        <FormControl>
                                            <Textarea
                                                placeholder="A lone astronaut on a red planet..."
                                                className="studio-field resize-none rounded-xl text-white placeholder:text-white/35"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="studio-subcard space-y-2 rounded-xl p-3">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs uppercase tracking-[0.16em] text-white/50">Quick Styles</div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={clearAllFields}
                                        variant="studioGhost"
                                        className="h-7 rounded-lg px-2.5 text-[11px]"
                                    >
                                        Clear All
                                    </Button>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {QUICK_STYLE_PRESETS.map((style) => (
                                        <button
                                            key={style.id}
                                            type="button"
                                            onClick={() => applyQuickStyle(style.id)}
                                            className="studio-chip rounded-full px-3 py-1.5 text-xs"
                                        >
                                            {style.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

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
                                                            <SelectTrigger className="studio-field rounded-xl text-white">
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

                            <details
                                className="studio-subcard rounded-xl"
                                open={isAdvancedOpen}
                                onToggle={(event) => setIsAdvancedOpen(event.currentTarget.open)}
                            >
                                <summary className="cursor-pointer list-none px-3 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-medium text-white/80">Advanced Controls</div>
                                            <p className="text-xs text-white/45">Model, quality, seed lock, and generation tuning.</p>
                                        </div>
                                        <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                                            {isAdvancedOpen ? "Hide" : "Show"}
                                        </span>
                                    </div>
                                </summary>

                                <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3">
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end">
                                        <FormField
                                            control={form.control}
                                            name="providerSlug"
                                            render={({ field }) => (
                                                <FormItem className="min-w-0">
                                                    <FormLabel className="text-white/80">Provider</FormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value ?? "auto"}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="studio-field min-w-0 rounded-xl text-white [&>span]:truncate">
                                                                <SelectValue placeholder="Auto" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                            <SelectItem value="auto">Auto</SelectItem>
                                                            <SelectItem value="openai">OpenAI</SelectItem>
                                                            <SelectItem value="kie">Kie.ai</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="quality"
                                            render={({ field }) => (
                                                <FormItem className="min-w-0">
                                                    <FormLabel className="text-white/80">Quality</FormLabel>
                                                    <Select
                                                        onValueChange={field.onChange}
                                                        value={field.value ?? "standard"}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger className="studio-field rounded-xl text-white [&>span]:truncate">
                                                                <SelectValue placeholder="standard" />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent className="border-white/10 bg-[#111114] text-white">
                                                            <SelectItem value="standard">Standard</SelectItem>
                                                            <SelectItem value="hd">HD</SelectItem>
                                                            <SelectItem value="high">High</SelectItem>
                                                        </SelectContent>
                                                    </Select>
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
                                                        placeholder={
                                                            selectedProvider === "kie"
                                                                ? "e.g. qwen/qwen-image"
                                                                : selectedProvider === "openai"
                                                                    ? "e.g. dall-e-3"
                                                                    : "e.g. dall-e-3 or qwen/qwen-image"
                                                        }
                                                        value={field.value ?? ""}
                                                        onChange={(event) => field.onChange(event.target.value)}
                                                        className="studio-field rounded-xl text-white placeholder:text-white/35"
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
                                                        className="studio-field resize-none rounded-xl text-white placeholder:text-white/35"
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
                                                            className="studio-field rounded-xl text-white placeholder:text-white/35"
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
                                                            className="studio-field rounded-xl text-white placeholder:text-white/35"
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
                                                            className="studio-field rounded-xl text-white placeholder:text-white/35"
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
                                                            className="studio-field rounded-xl text-white placeholder:text-white/35"
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
                                                <FormItem className="studio-subcard flex items-center justify-between rounded-xl px-3 py-2">
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
                            </details>

                            <Button type="submit" variant="studio" disabled={isSaving} className="w-full">
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

            <div className="space-y-5">
                <StudioAdPanel
                    promptPreview={promptPreview}
                    onApplyPacket={handleApplyAdPacket}
                    context={{ projectId, sceneId }}
                />

                <Card className="studio-card rounded-2xl text-white">
                    <CardHeader>
                        <CardTitle className="flex flex-1 items-center text-sm font-medium uppercase tracking-wider text-white/55">
                            <Sparkles className="mr-2 h-4 w-4 text-white/45" />
                            Prompt Preview
                        </CardTitle>
                        <Button
                            type="button"
                            size="xs"
                            variant="studioGhost"
                            onClick={() => copyToClipboard(promptPreview, "Full prompt")}
                            className="h-7 gap-1.5 rounded-lg border border-white/5 bg-white/5 px-2.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white"
                        >
                            <Copy className="h-3.5 w-3.5" />
                            Copy Full Prompt
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="studio-subcard max-h-56 overflow-y-auto rounded-xl p-4 font-mono text-sm leading-relaxed text-white/80">
                            {promptPreview || <span className="italic text-white/45">Start building your shot...</span>}
                        </div>
                    </CardContent>
                    <CardFooter>
                        <p className="text-xs text-white/50">
                            Descriptors are assembled in the exact order required for cinematic prompts.
                        </p>
                    </CardFooter>
                </Card>

                <details
                    className="studio-card rounded-2xl text-white"
                    open={isPresetManagerOpen}
                    onToggle={(event) => setIsPresetManagerOpen(event.currentTarget.open)}
                >
                    <summary className="cursor-pointer list-none px-6 py-5">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-sm font-medium uppercase tracking-wider text-white/55">
                                Shot Presets
                            </CardTitle>
                            <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">
                                {isPresetManagerOpen ? "Hide" : "Manage"}
                            </span>
                        </div>
                    </summary>
                    <div className="space-y-3 border-t border-white/10 px-6 pb-5 pt-4">
                        <div className="grid gap-2">
                            <Input
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                placeholder="Preset name"
                                className="studio-field rounded-xl text-white placeholder:text-white/35"
                            />
                            <Input
                                value={newPresetDescription}
                                onChange={(e) => setNewPresetDescription(e.target.value)}
                                placeholder="Description (optional)"
                                className="studio-field rounded-xl text-white placeholder:text-white/35"
                            />
                            <Button
                                type="button"
                                onClick={handleSavePreset}
                                disabled={isSavingPreset || !newPresetName.trim()}
                                variant="studioSecondary"
                                className="w-full disabled:cursor-not-allowed disabled:opacity-60"
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
                                <div className="studio-subcard rounded-xl p-3 text-xs text-white/50">
                                    Loading presets...
                                </div>
                            )}
                            {!isLoadingPresets && presets.length === 0 && (
                                <div className="studio-subcard rounded-xl p-3 text-xs text-white/50">
                                    No presets yet. Save your first setup.
                                </div>
                            )}
                            {presets.map((preset) => (
                                <div
                                    key={preset.id}
                                    className="studio-subcard flex items-center justify-between gap-3 rounded-xl px-3 py-2"
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
                                            variant="studioSecondary"
                                            className="rounded-full px-3 text-xs"
                                        >
                                            Apply
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => handleDeletePreset(preset.id)}
                                            variant="studioGhost"
                                            className="rounded-full text-xs"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </details>
            </div>
        </div>
    )
}
