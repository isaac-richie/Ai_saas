"use client"

import { useMemo, useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
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
import { generateShot } from "@/core/actions/generation"
import { attachElementToShot } from "@/core/actions/elements"
import { createPreset, deletePreset, getPresets } from "@/core/actions/presets"
import { StudioAdPanel } from "@/interface/components/shots/StudioAdPanel"
import { LookBuilder } from "@/interface/components/shots/LookBuilder"
import { Loader2, Plus, Sparkles, Copy, Check, Wand2, Clapperboard, X, ChevronDown } from "lucide-react"
import { ShotFlowPanel, type FlowSequence, type FlowShot } from "@/interface/components/shots/ShotFlowPanel"
import { StyleSwatch } from "@/interface/components/fast-video/preset-visuals"
import { toast } from "sonner"
import { FAST_TRACK_HANDOFF_KEY } from "@/core/config/handoff"

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
    /** Shots in this scene; the newest one drives the guided Choose / Animate / Continue panel. */
    shots?: FlowShot[]
    sequences?: FlowSequence[]
}

type AvailableElement = {
    id: string
    name: string
    type?: string | null
    description?: string | null
}

type Continuation = { imageUrl: string; shotName: string; shotId: string }

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

/** Example stills for quick styles that match a Fast Track style image. */
const QUICK_STYLE_PREVIEWS: Record<string, string> = {
    noir: "style_classic_noir_bw",
    "golden-hour": "style_golden_hour_film",
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

export function ShotBuilder({ projectId, sceneId, onShotCreated, shots = [], sequences = [] }: ShotBuilderProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const router = useRouter()
    const previewRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<HTMLDivElement>(null)
    const [activeShotId, setActiveShotId] = useState<string | null>(null)
    const [continuation, setContinuation] = useState<Continuation | null>(null)
    const [enhanceUndo, setEnhanceUndo] = useState<string | null>(null)
    const [isEnhancing, setIsEnhancing] = useState(false)
    // The shot being worked on: the one just created here, otherwise the newest in the scene.
    const activeShot = (activeShotId ? shots.find((shot) => shot.id === activeShotId) : undefined) ?? (activeShotId ? undefined : shots[shots.length - 1])
    const [availableElements, setAvailableElements] = useState<AvailableElement[]>([])
    const [selectedElementIds, setSelectedElementIds] = useState<Set<string>>(new Set())
    const [isMounted, setIsMounted] = useState(false)
    const [appliedQuickStyle, setAppliedQuickStyle] = useState<string | null>(null)
    const [presets, setPresets] = useState<ShotPreset[]>([])
    const [isLoadingPresets, setIsLoadingPresets] = useState(true)
    const [isSavingPreset, setIsSavingPreset] = useState(false)
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
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
            variations: 2,
        },
    })

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
        setAppliedQuickStyle(null)
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
            variations: 2,
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

        // The director's writing model is not the image model: keep Auto unless Kie was chosen,
        // so attached references are never silently dropped.
        form.setValue("providerSlug", providerTarget === "kie" ? "kie" : "auto")

        toast.success("Assistant Director prompt applied", {
            description: "Nothing is generated yet. Press Generate image when ready.",
            action: { label: "Generate image", onClick: () => void handleAddAndGenerate() },
        })
        requestAnimationFrame(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    }

    async function onSubmit(data: ShotFormValues) {
        await saveShot(data)
    }

    /** Creates the shot from the current builder state; returns its id on success. */
    async function saveShot(data: ShotFormValues): Promise<string | null> {
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
            // A continued shot starts from the previous shot's approved image.
            ...(continuation ? { continuity_image_url: continuation.imageUrl, previous_shot_id: continuation.shotId } : {}),
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
            toast.success("Shot added to your shot list")
            // Keep the current prompt/choices until user manually clears or refreshes.
            form.setValue("subject", data.subject)
            setSelectedElementIds(new Set())
            onShotCreated?.()
        }
        if (!res.error && res.data?.id) setActiveShotId(res.data.id)
        return res.error ? null : res.data?.id ?? null
    }

    // One step from a finished prompt to a generated shot.
    const handleAddAndGenerate = form.handleSubmit(async (data) => {
        const shotId = await saveShot(data)
        if (!shotId) return
        setIsGenerating(true)
        toast.loading("Generating your shot…", { id: "shot-generate" })
        try {
            const res = await generateShot(shotId)
            if (res.error) toast.error(res.error, { id: "shot-generate" })
            else {
                toast.success("Your images are ready. Choose one below.", { id: "shot-generate" })
                setContinuation(null)
                setEnhanceUndo(null)
            }
        } catch {
            toast.error("Generation failed. Try Generate on the shot card.", { id: "shot-generate" })
        } finally {
            setIsGenerating(false)
            router.refresh()
        }
    }, () => toast.error("Describe what you want to see first."))

    // Optional helper: turns a short idea into a fuller prompt, with Undo.
    const handleEnhance = async () => {
        const current = (form.getValues("subject") || "").trim()
        if (current.length < 2) { toast.error("Write a short idea first."); return }
        setIsEnhancing(true)
        try {
            const references = availableElements.filter((el) => selectedElementIds.has(el.id)).map((el) => ({ role: el.type || "reference", name: el.name.slice(0, 180), guidance: el.description?.slice(0, 240) || undefined }))
            const response = await fetch("/api/storyboard/enhance-direction", {
                method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(45_000),
                body: JSON.stringify({ direction: current.slice(0, 1200), references, startsFromPreviousShot: Boolean(continuation) }),
            })
            const body = await response.json().catch(() => ({}))
            if (!response.ok || typeof body.prompt !== "string") throw new Error(body.error || "Couldn't enhance right now")
            setEnhanceUndo(current)
            form.setValue("subject", body.prompt, { shouldDirty: true })
            toast.success("AI-enhanced prompt ready", { description: "Nothing is generated until you press Generate image.", action: { label: "Undo", onClick: () => { form.setValue("subject", current); setEnhanceUndo(null) } } })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Couldn't enhance right now")
        } finally {
            setIsEnhancing(false)
        }
    }

    const startContinuation = ({ imageUrl, shotName }: { imageUrl: string; shotName: string }) => {
        if (!activeShot) return
        setContinuation({ imageUrl, shotName, shotId: activeShot.id })
        setActiveShotId(null)
        form.setValue("subject", "")
        setEnhanceUndo(null)
        requestAnimationFrame(() => {
            composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            composerRef.current?.querySelector("textarea")?.focus()
        })
    }

    const selectedElementNames = availableElements.filter((el) => selectedElementIds.has(el.id)).map((el) => el.name)

    const handleSendToFastTrack = () => {
        const prompt = (form.getValues("subject") || "").trim() || promptPreview.trim()
        if (!prompt) { toast.error("Build a prompt first."); return }
        try { sessionStorage.setItem(FAST_TRACK_HANDOFF_KEY, prompt.slice(0, 4000)) } catch { /* storage blocked: Fast Track opens empty */ }
        router.push("/dashboard/fast-video")
    }

    if (!isMounted) {
        return (
            <div className="flex flex-col gap-5 min-w-0">
                <div className="min-h-[400px] rounded-2xl border border-gold-400/[0.12] lux-shimmer" />
                <div className="min-h-[150px] rounded-2xl border border-gold-400/[0.12] lux-shimmer" />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-6 min-w-0 2xl:gap-8">
            <Card ref={composerRef} className="studio-card scroll-mt-24 rounded-2xl text-white">
                <CardHeader className="pb-2">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80">Shot {String(shots.length + 1).padStart(2, "0")}</p>
                    <CardTitle className="font-serif text-xl tracking-tight text-[#f1ece0]">What do you want to see?</CardTitle>
                    <p className="text-xs text-white/40">Describe it, generate images, choose one, then animate it or add it to your sequence.</p>
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
                                            <FormLabel className="sr-only">What do you want to see?</FormLabel>
                                            <span className="text-[11px] text-white/40">{enhanceUndo ? "AI-enhanced. Edit freely." : "One or two sentences is plenty."}</span>
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
                                                placeholder={continuation ? "What happens next? e.g. He raises the megaphone and shouts." : "e.g. A boy walks toward the camera as robotic pedestrians pass him."}
                                                className="studio-field min-h-24 resize-none rounded-xl text-[13.5px] text-white placeholder:text-white/35"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {continuation ? (
                                <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-emerald-300/20 bg-emerald-400/[0.05] p-2.5 text-[12px]">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={continuation.imageUrl} alt="" className="h-10 w-16 rounded-md object-cover" />
                                    <div className="min-w-0 flex-1">
                                        <p className="flex items-center gap-1.5 text-emerald-50"><Check className="h-3.5 w-3.5 text-emerald-300" />Continuing from {continuation.shotName}</p>
                                        <p className="truncate text-[11px] text-white/50">{selectedElementNames.length ? `Continuing with ${selectedElementNames.join(" and ")}.` : "Starts from the approved image."}</p>
                                    </div>
                                    <button type="button" onClick={() => document.getElementById("project-references")?.scrollIntoView({ behavior: "smooth" })} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/70 hover:border-gold-300/40 hover:text-gold-50">Change references</button>
                                    <button type="button" onClick={() => setContinuation(null)} className="rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-white/70 hover:border-gold-300/40 hover:text-gold-50">Start new scene</button>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-0.5 text-[11px] text-white/40">Using</span>
                                {availableElements.map((el) => {
                                    const on = selectedElementIds.has(el.id)
                                    return (
                                        <button key={el.id} type="button" aria-pressed={on} onClick={() => toggleElement(el.id)}
                                            className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11.5px] transition ${on ? "bg-emerald-400/15 text-emerald-50 ring-1 ring-emerald-300/30" : "border border-gold-400/[0.14] text-white/55 hover:text-white/90"}`}>
                                            {on ? <Check className="h-3 w-3" /> : null}{el.name}
                                        </button>
                                    )
                                })}
                                <button type="button" onClick={() => document.getElementById("project-references")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                                    className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-gold-400/30 px-2.5 text-[11.5px] text-white/55 transition hover:border-gold-300/60 hover:text-gold-50">
                                    <Plus className="h-3 w-3" />Add reference
                                </button>
                            </div>

                            {selectedProvider === "openai" && (selectedElementIds.size > 0 || continuation) ? (
                                <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] px-3 py-2 text-[12px] text-amber-100">
                                    <span className="min-w-0 flex-1">OpenAI images can&apos;t use your reference images, so the character and place may not match.</span>
                                    <button type="button" onClick={() => form.setValue("providerSlug", "auto", { shouldDirty: true })} className="rounded-full bg-amber-200 px-3 py-0.5 text-[11.5px] font-semibold text-[#1a160e] hover:bg-amber-100">Switch to Auto</button>
                                </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-2">
                                <Button type="button" variant="studio" onClick={() => void handleAddAndGenerate()} disabled={isSaving || isGenerating} className="h-11 flex-1 px-6 text-[13px] font-semibold sm:flex-none">
                                    {isSaving || isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                    {isGenerating ? "Generating images…" : isSaving ? "Preparing…" : "Generate image"}
                                </Button>
                                <Button type="button" variant="studioSecondary" onClick={() => void handleEnhance()} disabled={isEnhancing || isSaving || isGenerating} className="h-11">
                                    {isEnhancing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    Enhance with AI
                                </Button>
                                {enhanceUndo ? (
                                    <button type="button" onClick={() => { form.setValue("subject", enhanceUndo); setEnhanceUndo(null) }} className="text-[11.5px] text-white/50 underline-offset-2 hover:text-white/85 hover:underline">
                                        Undo enhance
                                    </button>
                                ) : null}
                            </div>

                            <details className="group/more studio-subcard rounded-xl">
                                <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2.5 text-[12px] text-white/60 hover:text-white/85 [&::-webkit-details-marker]:hidden">
                                    <span>More options <span className="text-white/35">· style, camera, look, quality</span></span>
                                    <ChevronDown className="h-3.5 w-3.5 transition group-open/more:rotate-180" />
                                </summary>
                                <div className="space-y-3 border-t border-gold-400/[0.1] p-3">
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
                                <div className="grid grid-cols-3 gap-2">
                                    {QUICK_STYLE_PRESETS.map((style) => {
                                        const applied = appliedQuickStyle === style.id
                                        const preview = QUICK_STYLE_PREVIEWS[style.id]
                                        return (
                                            <button
                                                key={style.id}
                                                type="button"
                                                aria-pressed={applied}
                                                data-active={applied}
                                                onClick={() => { applyQuickStyle(style.id); setAppliedQuickStyle(style.id) }}
                                                className={`preset-card group relative overflow-hidden rounded-xl border text-left transition-all duration-300 ${applied ? "border-gold-300/70 shadow-[0_14px_30px_-20px_rgba(217,192,138,0.8)]" : "border-gold-400/[0.14] hover:-translate-y-0.5 hover:border-gold-400/45"}`}
                                            >
                                                <span className="relative block h-16 overflow-hidden bg-obsidian-900">
                                                    {preview ? <StyleSwatch id={preview} name={style.name} /> : (
                                                        // Anamorphic is a lens format: a widescreen still with its signature streak flares.
                                                        <Image src="/presets/style_anamorphic_flare.jpg" alt="Example of the Anamorphic look" fill sizes="220px" className="preset-image object-cover" />
                                                    )}
                                                    <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                                                    <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[12px] font-medium text-white">{applied ? <Check className="h-3 w-3 text-gold-300" strokeWidth={3} /> : null}{style.name}</span>
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {loadingOptions ? (
                                <div className="grid gap-2" aria-label="Loading presets">
                                    <div className="lux-shimmer h-10 rounded-xl" />
                                    <div className="lux-shimmer h-24 rounded-xl" />
                                </div>
                            ) : (
                                <LookBuilder
                                    options={presetOptions ?? {}}
                                    values={Object.fromEntries(PROMPT_ORDER.map((category) => {
                                        const raw = watchedValues[category as keyof ShotFormValues]
                                        return [category, typeof raw === "string" ? raw : undefined]
                                    }))}
                                    labels={CATEGORY_LABELS}
                                    onChange={(category, key) => {
                                        form.setValue(category, key, { shouldDirty: true })
                                        setAppliedQuickStyle(null)
                                    }}
                                />
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

                                <div className="space-y-3 border-t border-gold-400/[0.12] px-3 pb-3 pt-3">
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
                                                        <SelectContent className="border-gold-400/[0.12] bg-obsidian-800 text-white">
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
                                                        <SelectContent className="border-gold-400/[0.12] bg-obsidian-800 text-white">
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

                            <Button type="submit" variant="studioGhost" disabled={isSaving} className="h-9 w-full text-[12px]">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                                Save as draft without generating
                            </Button>
                                </div>
                            </details>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            {activeShot && !continuation ? (
                <ShotFlowPanel
                    key={activeShot.id}
                    shot={activeShot}
                    shotNumber={Math.max(1, shots.findIndex((shot) => shot.id === activeShot.id) + 1)}
                    projectId={projectId}
                    sceneId={sceneId}
                    sequences={sequences}
                    referenceNames={selectedElementNames}
                    generating={isGenerating && activeShot.id === activeShotId}
                    onEdit={() => { composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); composerRef.current?.querySelector("textarea")?.focus() }}
                    onContinue={startContinuation}
                />
            ) : null}

            <details className="group/tools studio-card rounded-2xl text-white">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span>
                        <span className="block text-sm font-medium uppercase tracking-wider text-white/55">Director tools</span>
                        <span className="block text-xs text-white/40">Assistant Director variants, the full prompt, and saved looks.</span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-white/50 transition group-open/tools:rotate-180" />
                </summary>
            <div className="space-y-5 border-t border-gold-400/[0.1] p-4">
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
                            className="h-7 gap-1.5 rounded-lg border border-white/5 bg-white/5 px-2.5 text-[11px] text-white/60 hover:bg-gold-400/[0.08] hover:text-white"
                        >
                            <Copy className="h-3.5 w-3.5" />
                            Copy Full Prompt
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="studio-subcard max-h-56 overflow-y-auto rounded-xl p-4 text-[13px] leading-relaxed text-white/80">
                            {promptPreview || <span className="italic text-white/45">Start building your shot...</span>}
                        </div>
                    </CardContent>
                    <CardFooter className="flex flex-col items-stretch gap-2">
                        <div ref={previewRef} className="grid gap-2">

                            <Button type="button" variant="studioSecondary" onClick={handleSendToFastTrack} disabled={!promptPreview.trim()} className="h-10">
                                <Clapperboard className="mr-2 h-4 w-4" />
                                Make video in Fast Track
                            </Button>
                        </div>
                        <p className="text-xs text-white/45">
                            Prefer straight-to-video? Fast Track turns this prompt into a clip without the image step.
                        </p>
                    </CardFooter>
                </Card>

                <Card className="studio-card rounded-2xl text-white">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium uppercase tracking-wider text-white/55">My looks</CardTitle>
                        <p className="text-xs text-white/40">Save the current look and apply it to any shot in one tap.</p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-1.5">
                            {isLoadingPresets ? (
                                <span className="h-8 w-40 rounded-full lux-shimmer" />
                            ) : presets.length === 0 ? (
                                <span className="text-xs text-white/40">No saved looks yet.</span>
                            ) : (
                                presets.map((preset) => (
                                    <span key={preset.id} className="group/look inline-flex items-center rounded-full border border-gold-400/20 bg-white/[0.04] transition hover:border-gold-300/45">
                                        <button
                                            type="button"
                                            onClick={() => applyPreset(preset)}
                                            title={preset.description || `Apply ${preset.name}`}
                                            className="h-8 max-w-[14rem] truncate pl-3 pr-1.5 text-xs text-white/85 hover:text-gold-50"
                                        >
                                            {preset.name}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDeletePreset(preset.id)}
                                            aria-label={`Delete ${preset.name}`}
                                            className="grid size-7 place-items-center rounded-full text-white/30 transition hover:text-rose-200"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                ))
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Input
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && newPresetName.trim()) { e.preventDefault(); void handleSavePreset() } }}
                                placeholder="Name this look, e.g. Moody night street"
                                className="studio-field h-9 rounded-xl text-white placeholder:text-white/35"
                            />
                            <Button
                                type="button"
                                onClick={handleSavePreset}
                                disabled={isSavingPreset || !newPresetName.trim()}
                                variant="studioSecondary"
                                className="h-9 shrink-0 rounded-xl"
                            >
                                {isSavingPreset ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />}
                                Save look
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
            </details>
        </div>
    )
}
