"use client"

import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import { AlertTriangle, ImagePlus, Lock, Package, ShieldCheck, Unlock, UserRound, X } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET } from "@/core/validation/media-reference"
import {
  CAMPAIGN_MODE_LABELS, CAMPAIGN_STYLES, CHARACTER_ROLES, DEFAULT_PRODUCT_FORBIDDEN_CHANGES, PRODUCT_RELATIONSHIPS, REFERENCE_INFLUENCES,
  campaignMode, campaignReferenceIssues, referenceCapability,
  type CampaignReferences, type CharacterReference, type ProductReference,
} from "@/core/validation/campaign-references"
import { uploadFrameImage } from "./frame-capture"

/**
 * Optional Character and Product references for the Campaign Director.
 * Leaving both empty keeps the existing generic UGC workflow untouched.
 */
export function CampaignReferencesPanel({ value, onChange, modelFamilyId, modelLabel, disabled = false, onBusy }: {
  value: CampaignReferences
  onChange: (next: CampaignReferences) => void
  modelFamilyId: string
  modelLabel: string
  disabled?: boolean
  onBusy?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState<"character" | "product" | null>(null)
  const [error, setError] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingType = useRef<"character" | "product">("character")
  useEffect(() => { onBusy?.(Boolean(busy)); return () => onBusy?.(false) }, [busy, onBusy])

  const mode = campaignMode(value)
  const capability = referenceCapability(modelFamilyId)
  const issues = campaignReferenceIssues(value, modelFamilyId)

  async function addImages(type: "character" | "product", files: File[]) {
    const current = value[type]
    const room = 4 - (current?.assetPaths.length ?? 0)
    if (room <= 0) { setError("Each reference holds up to 4 images. Remove one to add another."); return }
    setBusy(type)
    setError("")
    try {
      const paths: string[] = []
      for (const file of files.slice(0, room)) paths.push(await uploadFrameImage(file))
      if (type === "character") {
        const next: CharacterReference = current && current.type === "character"
          ? { ...current, assetPaths: [...current.assetPaths, ...paths] }
          : { id: crypto.randomUUID(), type: "character", name: "Character 01", assetPaths: paths, role: "presenter", locks: { identity: true, wardrobe: true, expression: false, movement: false }, influence: "high", rightsConfirmed: false }
        onChange({ ...value, character: next })
      } else {
        const next: ProductReference = current && current.type === "product"
          ? { ...current, assetPaths: [...current.assetPaths, ...paths] }
          : { id: crypto.randomUUID(), type: "product", name: "Product 01", assetPaths: paths, forbiddenChanges: DEFAULT_PRODUCT_FORBIDDEN_CHANGES, locks: { shape: true, logoText: true, colour: true, packaging: true }, influence: "high", rightsConfirmed: false }
        onChange({ ...value, product: next })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add those images.")
    } finally {
      setBusy(null)
    }
  }

  const pick = (type: "character" | "product") => { pendingType.current = type; fileInput.current?.click() }

  return (
    <section aria-label="Campaign references" className="space-y-3 rounded-2xl border border-gold-400/[0.14] bg-[linear-gradient(180deg,rgba(217,192,138,0.05),transparent_45%)] p-3.5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gold-300/80">Campaign references</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#8f9086]">Optional. Keep the same person and the same product across every asset.</p>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] ${mode === "generic" ? "border-gold-400/15 text-[#a3a59a]" : "border-gold-300/40 bg-gold-400/10 text-gold-100"}`}>{CAMPAIGN_MODE_LABELS[mode]}</span>
      </header>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <ReferenceCard
          kind="character"
          reference={value.character ?? null}
          busy={busy === "character"}
          disabled={disabled || Boolean(busy)}
          onAdd={() => pick("character")}
          onRemove={() => onChange({ ...value, character: null })}
          onRemoveImage={(path) => value.character && onChange({ ...value, character: value.character.assetPaths.length > 1 ? { ...value.character, assetPaths: value.character.assetPaths.filter((item) => item !== path) } : null })}
        >
          {value.character ? <CharacterFields reference={value.character} disabled={disabled} onChange={(character) => onChange({ ...value, character })} /> : null}
        </ReferenceCard>
        <ReferenceCard
          kind="product"
          reference={value.product ?? null}
          busy={busy === "product"}
          disabled={disabled || Boolean(busy)}
          onAdd={() => pick("product")}
          onRemove={() => onChange({ ...value, product: null })}
          onRemoveImage={(path) => value.product && onChange({ ...value, product: value.product.assetPaths.length > 1 ? { ...value.product, assetPaths: value.product.assetPaths.filter((item) => item !== path) } : null })}
        >
          {value.product ? <ProductFields reference={value.product} disabled={disabled} onChange={(product) => onChange({ ...value, product })} /> : null}
        </ReferenceCard>
      </div>

      {mode !== "generic" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">Campaign style</span>
            <select value={value.style} disabled={disabled} onChange={(event) => onChange({ ...value, style: event.target.value })} className="mt-1 h-9 w-full rounded-xl border px-2.5 text-[12px]">
              {CAMPAIGN_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">Character + product</span>
            <select value={value.relationship} disabled={disabled || !(value.character && value.product)} onChange={(event) => onChange({ ...value, relationship: event.target.value })} className="mt-1 h-9 w-full rounded-xl border px-2.5 text-[12px] disabled:opacity-50" title={value.character && value.product ? undefined : "Add both a character and a product to set how they interact"}>
              {PRODUCT_RELATIONSHIPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        </div>
      ) : null}

      {mode !== "generic" ? (
        <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-[#a3a59a]">
          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-[#b6ddd3]" />
          {modelLabel}: {capability.note}
        </p>
      ) : null}
      {value.product && !(value.product.locks.shape && value.product.locks.logoText) ? (
        <p role="status" className="flex items-start gap-1.5 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-2.5 py-2 text-[11px] text-amber-100">
          <Unlock className="mt-0.5 h-3 w-3 shrink-0" /> Product lock is off: product shape and label consistency are no longer guaranteed.
        </p>
      ) : null}
      {issues.length ? (
        <ul role="alert" className="space-y-1 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-2.5 py-2 text-[11px] text-amber-100">
          {issues.map((issue) => <li key={issue} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{issue}</li>)}
        </ul>
      ) : null}
      {error ? <p role="alert" className="text-[11px] text-amber-100">{error}</p> : null}

      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload reference images"
        onChange={(event) => {
          const files = Array.from(event.target.files || [])
          event.target.value = ""
          if (files.length) void addImages(pendingType.current, files)
        }}
      />
    </section>
  )
}

function ReferenceCard({ kind, reference, busy, disabled, onAdd, onRemove, onRemoveImage, children }: {
  kind: "character" | "product"
  reference: CharacterReference | ProductReference | null
  busy: boolean
  disabled: boolean
  onAdd: () => void
  onRemove: () => void
  onRemoveImage: (path: string) => void
  children: React.ReactNode
}) {
  const Icon = kind === "character" ? UserRound : Package
  const label = kind === "character" ? "Character" : "Product"
  const locked = reference
    ? reference.type === "character" ? reference.locks.identity : reference.locks.shape && reference.locks.logoText
    : false
  return (
    <div className={`overflow-hidden rounded-xl border transition-colors ${reference ? "border-gold-300/40 bg-gold-400/[0.04]" : "border-gold-400/[0.12] bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#e8e2d2]"><Icon className="h-3.5 w-3.5 text-gold-400" />{label}</span>
        {reference ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] uppercase tracking-[0.14em] ${locked ? "bg-gold-300 text-[#1a160e]" : "border border-amber-300/30 text-amber-100"}`}>
            {locked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}{locked ? "Locked" : "Unlocked"}
          </span>
        ) : <span className="text-[9.5px] uppercase tracking-[0.16em] text-[#77796f]">Optional</span>}
      </div>
      <div className="flex gap-1.5 px-3 pt-2">
        {reference?.assetPaths.map((path) => (
          <div key={path} className="group relative size-14 shrink-0 overflow-hidden rounded-lg border border-gold-400/15 bg-obsidian-900">
            <ReferenceThumb assetPath={path} alt={`${reference.name} reference`} />
            <button type="button" onClick={() => onRemoveImage(path)} disabled={disabled} aria-label={`Remove image from ${reference.name}`} className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><X className="h-2.5 w-2.5" /></button>
          </div>
        ))}
        {(!reference || reference.assetPaths.length < 4) ? (
          <button type="button" onClick={onAdd} disabled={disabled} className={`grid shrink-0 place-items-center rounded-lg border border-dashed border-gold-400/25 text-[#a3a59a] transition hover:border-gold-400/50 hover:text-gold-100 disabled:opacity-40 ${reference ? "size-14" : "h-14 w-full"}`}>
            {busy ? <span className="lux-shimmer size-full rounded-lg" /> : <span className="flex items-center gap-1.5 text-[11px]"><ImagePlus className="h-3.5 w-3.5" />{reference ? "" : `Add ${label.toLowerCase()} images (1–4)`}</span>}
          </button>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        {children}
        {reference ? <button type="button" onClick={onRemove} disabled={disabled} className="text-[10.5px] text-[#8f9086] hover:text-red-200">Remove {label.toLowerCase()}</button> : null}
      </div>
    </div>
  )
}

function ReferenceThumb({ assetPath, alt }: { assetPath: string; alt: string }) {
  const [url, setUrl] = useState("")
  useEffect(() => {
    let cancelled = false
    void createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(assetPath, 3600).then(({ data }) => { if (!cancelled && data) setUrl(data.signedUrl) })
    return () => { cancelled = true }
  }, [assetPath])
  // Private signed URLs must not pass through the image optimizer cache.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} className="h-full w-full object-cover" /> : <span className="lux-shimmer block h-full w-full" />
}

const inputClass = "h-8 w-full rounded-lg border px-2 text-[11.5px]"
const labelClass = "text-[9.5px] uppercase tracking-[0.16em] text-[#8f9086]"

function LockChip({ label, active, onToggle, disabled }: { label: string; active: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={active} disabled={disabled} onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${active ? "border-gold-300/60 bg-gold-400/15 text-gold-50" : "border-gold-400/15 text-[#8f9086] hover:text-gold-100"}`}>
      {active ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}{label}
    </button>
  )
}

function InfluencePicker({ value, onChange, disabled }: { value: CharacterReference["influence"]; onChange: (value: CharacterReference["influence"]) => void; disabled: boolean }) {
  return (
    <div role="radiogroup" aria-label="Reference influence" className="flex rounded-lg border border-gold-400/[0.12] bg-black/20 p-0.5">
      {REFERENCE_INFLUENCES.map((item) => (
        <button key={item} type="button" role="radio" aria-checked={value === item} disabled={disabled} onClick={() => onChange(item)}
          className={`flex-1 rounded-md py-1 text-[10.5px] capitalize transition ${value === item ? "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] font-semibold text-[#1a160e]" : "text-[#a3a59a] hover:text-gold-100"}`}>
          {item}
        </button>
      ))}
    </div>
  )
}

function CharacterFields({ reference, onChange, disabled }: { reference: CharacterReference; onChange: (next: CharacterReference) => void; disabled: boolean }) {
  const set = (patch: Partial<CharacterReference>) => onChange({ ...reference, ...patch })
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <label><span className={labelClass}>Name</span><input aria-label="Character name" value={reference.name} maxLength={80} disabled={disabled} onChange={(event) => set({ name: event.target.value })} className={inputClass} /></label>
        <label><span className={labelClass}>Role</span><select aria-label="Character role" value={reference.role} disabled={disabled} onChange={(event) => set({ role: event.target.value as CharacterReference["role"] })} className={`${inputClass} capitalize`}>{CHARACTER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
      </div>
      <details className="text-[11px] text-[#a3a59a]">
        <summary className="cursor-pointer select-none text-[10.5px] text-gold-300/90">Appearance, wardrobe & performance</summary>
        <div className="mt-2 space-y-1.5">
          <input aria-label="Age range" placeholder="Age range, e.g. late 20s" value={reference.ageRange ?? ""} maxLength={60} disabled={disabled} onChange={(event) => set({ ageRange: event.target.value })} className={inputClass} />
          <input aria-label="Appearance" placeholder="Appearance notes" value={reference.appearance ?? ""} maxLength={300} disabled={disabled} onChange={(event) => set({ appearance: event.target.value })} className={inputClass} />
          <input aria-label="Wardrobe" placeholder="Wardrobe notes" value={reference.wardrobe ?? ""} maxLength={300} disabled={disabled} onChange={(event) => set({ wardrobe: event.target.value })} className={inputClass} />
          <input aria-label="Voice and performance" placeholder="Voice / performance (optional)" value={reference.voice ?? ""} maxLength={200} disabled={disabled} onChange={(event) => set({ voice: event.target.value })} className={inputClass} />
          <input aria-label="Expression and action" placeholder="Expression & action, e.g. warm smile, nods" value={reference.expressionAction ?? ""} maxLength={200} disabled={disabled} onChange={(event) => set({ expressionAction: event.target.value })} className={inputClass} />
        </div>
      </details>
      <div className="flex flex-wrap gap-1">
        <LockChip label="Identity" active={reference.locks.identity} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, identity: !reference.locks.identity } })} />
        <LockChip label="Wardrobe" active={reference.locks.wardrobe} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, wardrobe: !reference.locks.wardrobe } })} />
        <LockChip label="Expression" active={reference.locks.expression} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, expression: !reference.locks.expression } })} />
        <LockChip label="Movement" active={reference.locks.movement} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, movement: !reference.locks.movement } })} />
      </div>
      <InfluencePicker value={reference.influence} disabled={disabled} onChange={(influence) => set({ influence })} />
      <RightsCheckbox checked={reference.rightsConfirmed} disabled={disabled} onChange={(rightsConfirmed) => set({ rightsConfirmed })}
        text="I have permission to use this person's likeness (or they are fictional)." />
    </>
  )
}

function ProductFields({ reference, onChange, disabled }: { reference: ProductReference; onChange: (next: ProductReference) => void; disabled: boolean }) {
  const set = (patch: Partial<ProductReference>) => onChange({ ...reference, ...patch })
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <label><span className={labelClass}>Name</span><input aria-label="Product name" value={reference.name} maxLength={80} disabled={disabled} onChange={(event) => set({ name: event.target.value })} className={inputClass} /></label>
        <label><span className={labelClass}>Variant</span><input aria-label="Product variant" placeholder="e.g. 50 ml, rose" value={reference.variant ?? ""} maxLength={120} disabled={disabled} onChange={(event) => set({ variant: event.target.value })} className={inputClass} /></label>
      </div>
      <details className="text-[11px] text-[#a3a59a]">
        <summary className="cursor-pointer select-none text-[10.5px] text-gold-300/90">Label, materials & forbidden changes</summary>
        <div className="mt-2 space-y-1.5">
          <input aria-label="Logo and label text" placeholder="Exact logo / label text" value={reference.logoText ?? ""} maxLength={160} disabled={disabled} onChange={(event) => set({ logoText: event.target.value })} className={inputClass} />
          <input aria-label="Colour and material" placeholder="Colour and material" value={reference.colourMaterial ?? ""} maxLength={200} disabled={disabled} onChange={(event) => set({ colourMaterial: event.target.value })} className={inputClass} />
          <input aria-label="Packaging and accessories" placeholder="Packaging and accessories" value={reference.packaging ?? ""} maxLength={200} disabled={disabled} onChange={(event) => set({ packaging: event.target.value })} className={inputClass} />
          <input aria-label="Key features to show" placeholder="Key features to show" value={reference.keyFeatures ?? ""} maxLength={300} disabled={disabled} onChange={(event) => set({ keyFeatures: event.target.value })} className={inputClass} />
          <input aria-label="Forbidden changes" placeholder="Forbidden changes, comma-separated" value={reference.forbiddenChanges.join(", ")} disabled={disabled}
            onChange={(event) => set({ forbiddenChanges: event.target.value.split(",").map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 8) })} className={inputClass} />
        </div>
      </details>
      <div className="flex flex-wrap gap-1">
        <LockChip label="Shape" active={reference.locks.shape} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, shape: !reference.locks.shape } })} />
        <LockChip label="Logo / text" active={reference.locks.logoText} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, logoText: !reference.locks.logoText } })} />
        <LockChip label="Colour" active={reference.locks.colour} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, colour: !reference.locks.colour } })} />
        <LockChip label="Packaging" active={reference.locks.packaging} disabled={disabled} onToggle={() => set({ locks: { ...reference.locks, packaging: !reference.locks.packaging } })} />
      </div>
      <InfluencePicker value={reference.influence} disabled={disabled} onChange={(influence) => set({ influence })} />
      <RightsCheckbox checked={reference.rightsConfirmed} disabled={disabled} onChange={(rightsConfirmed) => set({ rightsConfirmed })}
        text="I own or am authorised to use these product images and branding." />
    </>
  )
}

function RightsCheckbox({ checked, onChange, text, disabled }: { checked: boolean; onChange: (checked: boolean) => void; text: string; disabled: boolean }) {
  return (
    <label className={`flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[10.5px] leading-snug transition ${checked ? "border-[#b6ddd3]/30 text-[#d6efe8]" : "border-amber-300/30 text-amber-100"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      {text}
    </label>
  )
}
