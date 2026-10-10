"use client"

import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import { AlertTriangle, ChevronDown, History, ImagePlus, Images, Lock, Package, Unlock, Upload, UserRound, X } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { REFERENCE_BUCKET } from "@/core/validation/media-reference"
import {
  CAMPAIGN_STYLES, CHARACTER_ROLES, DEFAULT_PRODUCT_FORBIDDEN_CHANGES, PRODUCT_RELATIONSHIPS, REFERENCE_INFLUENCES,
  campaignLockNegatives, campaignMode, campaignReferenceIssues, inferRelationship,
  type CampaignReferences, type CharacterReference, type ProductReference,
} from "@/core/validation/campaign-references"
import { listSavedCampaignReferences } from "@/core/actions/studio-ad-campaigns"
import { uploadFrameImage, fetchImageBlob } from "./frame-capture"
import { GalleryPicker } from "./GalleryPicker"

export type CampaignOutputSettings = {
  aspectRatio: string
  durationSeconds: number
  /** null = automatic (Seedance for reference campaigns). */
  modelOverride: "kling" | "seedance" | null
}

type Kind = "character" | "product"

const newCharacter = (paths: string[]): CharacterReference => ({
  id: crypto.randomUUID(), type: "character", name: "Character 01", assetPaths: paths, role: "presenter",
  locks: { identity: true, wardrobe: true, expression: false, movement: false }, influence: "medium", rightsConfirmed: false,
})
const newProduct = (paths: string[]): ProductReference => ({
  id: crypto.randomUUID(), type: "product", name: "Product 01", assetPaths: paths, forbiddenChanges: DEFAULT_PRODUCT_FORBIDDEN_CHANGES,
  locks: { shape: true, logoText: true, colour: true, packaging: true }, influence: "medium", rightsConfirmed: false,
})

/**
 * Simple by default: add a character and/or product, pick a style. Everything
 * technical (locks, influence, model, output) lives under Advanced. Leaving
 * both slots empty keeps the existing generic UGC workflow unchanged.
 */
export function CampaignReferencesPanel({ value, onChange, settings, onSettingsChange, effectiveModel, modelLabel, prompt, disabled = false, onBusy }: {
  value: CampaignReferences
  onChange: (next: CampaignReferences) => void
  settings: CampaignOutputSettings
  onSettingsChange: (next: CampaignOutputSettings) => void
  /** The model this campaign will actually use. */
  effectiveModel: string
  modelLabel: string
  prompt: string
  disabled?: boolean
  onBusy?: (busy: boolean) => void
}) {
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState("")
  const [picker, setPicker] = useState<{ kind: Kind; source: "gallery" | "saved" } | null>(null)
  const [relationshipTouched, setRelationshipTouched] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingKind = useRef<Kind>("character")
  useEffect(() => { onBusy?.(Boolean(busy)); return () => onBusy?.(false) }, [busy, onBusy])

  const mode = campaignMode(value)
  const issues = campaignReferenceIssues(value, effectiveModel)
  const both = Boolean(value.character && value.product)

  // A sensible interaction from the prompt until the creator picks one.
  const suggested = inferRelationship(prompt)
  useEffect(() => {
    if (both && !relationshipTouched && value.relationship !== suggested) onChange({ ...value, relationship: suggested })
  }, [both, relationshipTouched, suggested, value, onChange])

  async function attach(kind: Kind, blobs: Blob[]) {
    const current = value[kind]
    const room = 4 - (current?.assetPaths.length ?? 0)
    if (room <= 0) { setError("Each reference holds up to 4 images. Remove one to add another."); return }
    setBusy(kind)
    setError("")
    try {
      const paths: string[] = []
      for (const blob of blobs.slice(0, room)) paths.push(await uploadFrameImage(blob))
      if (kind === "character") onChange({ ...value, character: current?.type === "character" ? { ...current, assetPaths: [...current.assetPaths, ...paths] } : newCharacter(paths) })
      else onChange({ ...value, product: current?.type === "product" ? { ...current, assetPaths: [...current.assetPaths, ...paths] } : newProduct(paths) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add those images.")
    } finally {
      setBusy(null)
    }
  }

  const removeImage = (kind: Kind, path: string) => {
    const ref = value[kind]
    if (!ref) return
    onChange({ ...value, [kind]: ref.assetPaths.length > 1 ? { ...ref, assetPaths: ref.assetPaths.filter((item) => item !== path) } : null })
  }

  return (
    <section aria-label="Campaign references" className="space-y-3">
      <div className="grid gap-2">
        {(["character", "product"] as const).map((kind) => (
          <ReferenceSlot
            key={kind}
            kind={kind}
            reference={value[kind] ?? null}
            busy={busy === kind}
            disabled={disabled || Boolean(busy)}
            onUpload={() => { pendingKind.current = kind; fileInput.current?.click() }}
            onGallery={() => setPicker({ kind, source: "gallery" })}
            onSaved={() => setPicker({ kind, source: "saved" })}
            onRemove={() => onChange({ ...value, [kind]: null })}
            onRemoveImage={(path) => removeImage(kind, path)}
            onRights={(rightsConfirmed) => { const ref = value[kind]; if (ref) onChange({ ...value, [kind]: { ...ref, rightsConfirmed } }) }}
          />
        ))}
      </div>

      <div className="grid gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">Style</span>
          <select aria-label="Campaign style" value={value.style} disabled={disabled} onChange={(event) => onChange({ ...value, style: event.target.value })} className="mt-1 h-9 w-full rounded-xl border px-2.5 text-[12px]">
            {CAMPAIGN_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
          </select>
        </label>
        {both ? (
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.18em] text-[#8f9086]">How they interact</span>
            <select aria-label="Character and product interaction" value={value.relationship} disabled={disabled} onChange={(event) => { setRelationshipTouched(true); onChange({ ...value, relationship: event.target.value }) }} className="mt-1 h-9 w-full rounded-xl border px-2.5 text-[12px]">
              {PRODUCT_RELATIONSHIPS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {issues.length ? (
        <ul role="alert" className="space-y-1 rounded-lg border border-amber-300/25 bg-amber-300/[0.06] px-2.5 py-2 text-[11px] text-amber-100">
          {issues.map((issue) => <li key={issue} className="flex items-start gap-1.5"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{issue}</li>)}
        </ul>
      ) : null}
      {mode !== "generic" ? (
        <p className="text-[10.5px] leading-relaxed text-[#8f9086]">References guide the video model; they keep people and products consistent as closely as the model allows, not pixel-perfect.</p>
      ) : null}
      {error ? <p role="alert" className="text-[11px] text-amber-100">{error}</p> : null}

      <AdvancedSettings value={value} onChange={onChange} settings={settings} onSettingsChange={onSettingsChange} effectiveModel={effectiveModel} modelLabel={modelLabel} disabled={disabled} />

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
          if (files.length) void attach(pendingKind.current, files)
        }}
      />
      <GalleryPicker
        key={picker?.source === "gallery" ? picker.kind : "closed"}
        open={picker?.source === "gallery"}
        imagesOnly
        title={`Choose a ${picker?.kind ?? "reference"} image`}
        description="Pick an image from your gallery."
        onClose={() => setPicker(null)}
        onPick={async (asset) => {
          const kind = picker?.kind
          setPicker(null)
          if (!kind) return
          try { await attach(kind, [await fetchImageBlob(asset.url)]) } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not use that image.") }
        }}
      />
      <SavedReferencePicker
        kind={picker?.source === "saved" ? picker.kind : null}
        onClose={() => setPicker(null)}
        onPick={(reference) => { setPicker(null); onChange({ ...value, [reference.type]: reference }) }}
      />
    </section>
  )
}

function ReferenceSlot({ kind, reference, busy, disabled, onUpload, onGallery, onSaved, onRemove, onRemoveImage, onRights }: {
  kind: Kind
  reference: CharacterReference | ProductReference | null
  busy: boolean
  disabled: boolean
  onUpload: () => void
  onGallery: () => void
  onSaved: () => void
  onRemove: () => void
  onRemoveImage: (path: string) => void
  onRights: (confirmed: boolean) => void
}) {
  const Icon = kind === "character" ? UserRound : Package
  const label = kind === "character" ? "Character" : "Product"
  return (
    <div className={`rounded-xl border p-2.5 transition-colors ${reference ? "border-gold-300/40 bg-gold-400/[0.04]" : "border-dashed border-gold-400/20 bg-white/[0.02]"}`}>
      <div className="flex items-center justify-between">
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-[#e8e2d2]"><Icon className="h-3.5 w-3.5 shrink-0 text-gold-400" />{label}</span>
        {reference
          ? <button type="button" onClick={onRemove} disabled={disabled} className="text-[10.5px] text-[#8f9086] hover:text-red-200">Remove</button>
          : <span className="ml-2 shrink-0 text-[9.5px] uppercase tracking-[0.16em] text-[#77796f]">Optional</span>}
      </div>
      {reference ? (
        <div className="mt-2 flex gap-1.5">
          {reference.assetPaths.map((path) => (
            <div key={path} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border border-gold-400/15 bg-obsidian-900">
              <ReferenceThumb assetPath={path} alt={`${reference.name} reference`} />
              <button type="button" onClick={() => onRemoveImage(path)} disabled={disabled} aria-label={`Remove image from ${reference.name}`} className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"><X className="h-2.5 w-2.5" /></button>
            </div>
          ))}
          {reference.assetPaths.length < 4 ? (
            <button type="button" onClick={onUpload} disabled={disabled} aria-label={`Add another ${label.toLowerCase()} image`} title="Optional: add another angle" className="grid size-12 place-items-center rounded-lg border border-dashed border-gold-400/25 text-[#a3a59a] hover:border-gold-400/50 hover:text-gold-100">
              {busy ? <span className="lux-shimmer size-full rounded-lg" /> : <ImagePlus className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
      ) : busy ? (
        <div className="lux-shimmer mt-2 h-12 rounded-lg" />
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <SourceButton icon={<Upload className="h-3 w-3" />} label={`Add ${label.toLowerCase()}`} onClick={onUpload} disabled={disabled} primary />
          <SourceButton icon={<Images className="h-3 w-3" />} label="My videos" onClick={onGallery} disabled={disabled} />
          <SourceButton icon={<History className="h-3 w-3" />} label="Saved" onClick={onSaved} disabled={disabled} />
        </div>
      )}
      {reference ? (
        <label className={`mt-2 flex items-start gap-2 rounded-lg border px-2 py-1.5 text-[10.5px] leading-snug ${reference.rightsConfirmed ? "border-[#b6ddd3]/30 text-[#d6efe8]" : "border-amber-300/35 text-amber-100"}`}>
          <input type="checkbox" checked={reference.rightsConfirmed} disabled={disabled} onChange={(event) => onRights(event.target.checked)} className="mt-0.5" />
          {kind === "character" ? "I have permission to use this person's likeness (or they're fictional)." : "I own or am authorised to use these product images and branding."}
        </label>
      ) : null}
    </div>
  )
}

function SourceButton({ icon, label, onClick, disabled, primary }: { icon: React.ReactNode; label: string; onClick: () => void; disabled: boolean; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] transition disabled:opacity-40 ${primary ? "flex-[1_1_100%] border-gold-300/40 bg-gold-400/10 text-gold-50 hover:bg-gold-400/20" : "border-gold-400/15 text-[#c8c3b3] hover:border-gold-400/45 hover:text-gold-100"}`}>
      {icon}{label}
    </button>
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

function SavedReferencePicker({ kind, onClose, onPick }: { kind: Kind | null; onClose: () => void; onPick: (reference: CharacterReference | ProductReference) => void }) {
  const [items, setItems] = useState<(CharacterReference | ProductReference)[] | null>(null)
  useEffect(() => {
    if (!kind) return
    let cancelled = false
    void listSavedCampaignReferences().then((result) => {
      if (cancelled) return
      setItems(kind === "character" ? result.data?.characters ?? [] : result.data?.products ?? [])
    })
    return () => { cancelled = true }
  }, [kind])
  if (!kind) return null
  return (
    <div role="dialog" aria-label={`Saved ${kind}s`} className="lux-rise rounded-xl border border-gold-400/20 bg-[#111311] p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-[#e8e2d2]">Saved {kind === "character" ? "characters" : "products"}</p>
        <button type="button" onClick={onClose} aria-label="Close saved references" className="text-[#8f9086] hover:text-gold-100"><X className="h-3.5 w-3.5" /></button>
      </div>
      {items === null ? <div className="lux-shimmer h-14 rounded-lg" /> : items.length === 0 ? (
        <p className="py-3 text-center text-[11px] text-[#8f9086]">Nothing saved yet. {kind === "character" ? "Characters" : "Products"} you use in a planned campaign appear here.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => onPick(item)} className="flex items-center gap-2 rounded-lg border border-gold-400/15 p-1.5 pr-2.5 text-left transition hover:border-gold-400/45">
              <span className="relative size-9 overflow-hidden rounded-md bg-obsidian-900"><ReferenceThumb assetPath={item.assetPaths[0]} alt={item.name} /></span>
              <span className="text-[11px] text-[#e8e2d2]">{item.name}<span className="block text-[9.5px] text-[#8f9086]">{item.assetPaths.length} image{item.assetPaths.length === 1 ? "" : "s"}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const inputClass = "h-8 w-full rounded-lg border px-2 text-[11.5px]"
const labelClass = "text-[9.5px] uppercase tracking-[0.16em] text-[#8f9086]"

function AdvancedSettings({ value, onChange, settings, onSettingsChange, effectiveModel, modelLabel, disabled }: {
  value: CampaignReferences
  onChange: (next: CampaignReferences) => void
  settings: CampaignOutputSettings
  onSettingsChange: (next: CampaignOutputSettings) => void
  effectiveModel: string
  modelLabel: string
  disabled: boolean
}) {
  const character = value.character
  const product = value.product
  const setCharacter = (patch: Partial<CharacterReference>) => character && onChange({ ...value, character: { ...character, ...patch } })
  const setProduct = (patch: Partial<ProductReference>) => product && onChange({ ...value, product: { ...product, ...patch } })
  const negatives = campaignLockNegatives(value)
  return (
    <details className="group rounded-xl border border-gold-400/[0.12] bg-black/10">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between px-3 py-2 text-[11.5px] text-[#c8c3b3] [&::-webkit-details-marker]:hidden">
        Advanced <span className="flex items-center gap-1 text-[10px] text-[#77796f]">{modelLabel} · {settings.aspectRatio} · {settings.durationSeconds}s<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="space-y-4 border-t border-gold-400/[0.1] p-3">
        {character ? (
          <fieldset className="space-y-2" disabled={disabled}>
            <legend className="mb-1 text-[11px] font-medium text-[#e8e2d2]">Character</legend>
            <div className="grid grid-cols-2 gap-1.5">
              <label><span className={labelClass}>Name</span><input aria-label="Character name" value={character.name} maxLength={80} onChange={(event) => setCharacter({ name: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Role</span><select aria-label="Character role" value={character.role} onChange={(event) => setCharacter({ role: event.target.value as CharacterReference["role"] })} className={`${inputClass} capitalize`}>{CHARACTER_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
            </div>
            <input aria-label="Wardrobe" placeholder="Wardrobe notes" value={character.wardrobe ?? ""} maxLength={300} onChange={(event) => setCharacter({ wardrobe: event.target.value })} className={inputClass} />
            <input aria-label="Expression and performance" placeholder="Expression / performance notes" value={character.expressionAction ?? ""} maxLength={200} onChange={(event) => setCharacter({ expressionAction: event.target.value })} className={inputClass} />
            <div className="flex flex-wrap gap-1">
              <LockChip label="Identity" active={character.locks.identity} onToggle={() => setCharacter({ locks: { ...character.locks, identity: !character.locks.identity } })} />
              <LockChip label="Wardrobe" active={character.locks.wardrobe} onToggle={() => setCharacter({ locks: { ...character.locks, wardrobe: !character.locks.wardrobe } })} />
              <LockChip label="Expression" active={character.locks.expression} onToggle={() => setCharacter({ locks: { ...character.locks, expression: !character.locks.expression } })} />
            </div>
            <Influence label="Character reference strength" value={character.influence} onChange={(influence) => setCharacter({ influence })} />
          </fieldset>
        ) : null}
        {product ? (
          <fieldset className="space-y-2" disabled={disabled}>
            <legend className="mb-1 text-[11px] font-medium text-[#e8e2d2]">Product</legend>
            <div className="grid grid-cols-2 gap-1.5">
              <label><span className={labelClass}>Name</span><input aria-label="Product name" value={product.name} maxLength={80} onChange={(event) => setProduct({ name: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Variant</span><input aria-label="Product variant" placeholder="e.g. 50 ml" value={product.variant ?? ""} maxLength={120} onChange={(event) => setProduct({ variant: event.target.value })} className={inputClass} /></label>
            </div>
            <input aria-label="Logo and label text" placeholder="Exact logo / label text" value={product.logoText ?? ""} maxLength={160} onChange={(event) => setProduct({ logoText: event.target.value })} className={inputClass} />
            <div className="flex flex-wrap gap-1">
              <LockChip label="Product identity" active={product.locks.shape} onToggle={() => setProduct({ locks: { ...product.locks, shape: !product.locks.shape } })} />
              <LockChip label="Logo & label" active={product.locks.logoText} onToggle={() => setProduct({ locks: { ...product.locks, logoText: !product.locks.logoText } })} />
              <LockChip label="Packaging" active={product.locks.packaging} onToggle={() => setProduct({ locks: { ...product.locks, packaging: !product.locks.packaging } })} />
              <LockChip label="Colour & material" active={product.locks.colour} onToggle={() => setProduct({ locks: { ...product.locks, colour: !product.locks.colour } })} />
            </div>
            {!(product.locks.shape && product.locks.logoText) ? <p role="status" className="flex items-start gap-1.5 text-[10.5px] text-amber-100"><Unlock className="mt-0.5 h-3 w-3 shrink-0" />Product lock is off: product shape and label consistency are no longer guaranteed.</p> : null}
            <Influence label="Product reference strength" value={product.influence} onChange={(influence) => setProduct({ influence })} />
          </fieldset>
        ) : null}
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="mb-1 text-[11px] font-medium text-[#e8e2d2]">Output</legend>
          <div className="grid grid-cols-2 gap-1.5">
            <label><span className={labelClass}>Aspect</span><select aria-label="Campaign aspect ratio" value={settings.aspectRatio} onChange={(event) => onSettingsChange({ ...settings, aspectRatio: event.target.value })} className={inputClass}>{["9:16", "1:1", "4:5", "16:9"].map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}</select></label>
            <label><span className={labelClass}>Duration</span><select aria-label="Campaign duration" value={settings.durationSeconds} onChange={(event) => onSettingsChange({ ...settings, durationSeconds: Number(event.target.value) })} className={inputClass}>{[5, 8, 10, 15].map((seconds) => <option key={seconds} value={seconds}>{seconds}s</option>)}</select></label>
            <label className="col-span-2"><span className={labelClass}>Model</span><select aria-label="Campaign model" value={settings.modelOverride ?? "auto"} onChange={(event) => onSettingsChange({ ...settings, modelOverride: event.target.value === "auto" ? null : event.target.value as "kling" | "seedance" })} className={inputClass}>
              <option value="auto">Seedance 2.5</option>
            </select></label>
          </div>
          {campaignMode(value) !== "generic" && effectiveModel === "kling" ? <p className="text-[10.5px] text-[#a3a59a]">Kling needs 2 to 4 JPG/PNG images per reference and opens on the first one.</p> : null}
          {negatives.length ? <p className="text-[10px] leading-relaxed text-[#77796f]">Always avoided: {negatives.join(", ")}.</p> : null}
        </fieldset>
      </div>
    </details>
  )
}

function LockChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={active} onClick={onToggle}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition ${active ? "border-gold-300/60 bg-gold-400/15 text-gold-50" : "border-gold-400/15 text-[#8f9086] hover:text-gold-100"}`}>
      {active ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}{label}
    </button>
  )
}

function Influence({ label, value, onChange }: { label: string; value: CharacterReference["influence"]; onChange: (value: CharacterReference["influence"]) => void }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div role="radiogroup" aria-label={label} className="mt-1 flex rounded-lg border border-gold-400/[0.12] bg-black/20 p-0.5">
        {REFERENCE_INFLUENCES.map((item) => (
          <button key={item} type="button" role="radio" aria-checked={value === item} onClick={() => onChange(item)}
            className={`flex-1 rounded-md py-1 text-[10.5px] capitalize transition ${value === item ? "bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] font-semibold text-[#1a160e]" : "text-[#a3a59a] hover:text-gold-100"}`}>
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}
