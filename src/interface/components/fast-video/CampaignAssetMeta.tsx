"use client"

import { Check, Flag, Lock, Package, ShieldAlert, UserRound } from "lucide-react"
import { applicableQualityChecks, type CampaignReferences, type QualityFlags } from "@/core/validation/campaign-references"

/**
 * Per-asset campaign details: which locks were active, the generation
 * settings, and the review checklist. Checks are recorded by the reviewer;
 * this does not claim automated verification.
 */
export function CampaignAssetMeta({ references, characterReferenceId, productReferenceId, model, durationSeconds, aspectRatio, completed, flags, onFlag }: {
  references: CampaignReferences
  characterReferenceId?: string | null
  productReferenceId?: string | null
  model: string
  durationSeconds: number
  aspectRatio: string
  completed: boolean
  flags: QualityFlags
  onFlag: (checkId: string, value: "pass" | "flag") => void
}) {
  const characterActive = Boolean(references.character && (!characterReferenceId || characterReferenceId === references.character.id))
  const productActive = Boolean(references.product && (!productReferenceId || productReferenceId === references.product.id))
  const characterLocked = characterActive && Boolean(references.character?.locks.identity)
  const productLocked = productActive && Boolean(references.product && references.product.locks.shape && references.product.locks.logoText)
  const checks = applicableQualityChecks({ ...references, character: characterActive ? references.character : null, product: productActive ? references.product : null })
  const flagged = checks.filter((check) => flags[check.id] === "flag").length
  const reviewed = checks.filter((check) => flags[check.id]).length

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        {characterActive ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${characterLocked ? "bg-gold-400/15 text-gold-100" : "border border-gold-400/15 text-[#a3a59a]"}`}>
            <UserRound className="h-2.5 w-2.5" />{references.character?.name}{characterLocked ? <Lock className="h-2.5 w-2.5" /> : null}
          </span>
        ) : null}
        {productActive ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${productLocked ? "bg-gold-400/15 text-gold-100" : "border border-amber-300/30 text-amber-100"}`}>
            <Package className="h-2.5 w-2.5" />{references.product?.name}{productLocked ? <Lock className="h-2.5 w-2.5" /> : " · unlocked"}
          </span>
        ) : null}
        <span className="text-[10px] text-[#8f9086]">{model} · {durationSeconds}s · {aspectRatio}</span>
      </div>
      {completed ? (
        <details className="rounded-lg border border-gold-400/[0.12] bg-black/20 px-2.5 py-1.5">
          <summary className="flex cursor-pointer select-none items-center justify-between text-[10.5px] text-[#c8c3b3]">
            <span className="flex items-center gap-1.5"><ShieldAlert className="h-3 w-3 text-gold-400" />Review before publishing</span>
            <span className={flagged ? "text-amber-200" : "text-[#8f9086]"}>{flagged ? `${flagged} flagged` : `${reviewed}/${checks.length} checked`}</span>
          </summary>
          <ul className="mt-2 space-y-1">
            {checks.map((check) => (
              <li key={check.id} className="flex items-center justify-between gap-2 text-[10.5px] text-[#a3a59a]">
                <span className={flags[check.id] === "flag" ? "text-amber-100" : undefined}>{check.label}</span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" aria-pressed={flags[check.id] === "pass"} aria-label={`${check.label}: passes`} onClick={() => onFlag(check.id, "pass")}
                    className={`grid size-5 place-items-center rounded-full border transition ${flags[check.id] === "pass" ? "border-[#b6ddd3] bg-[#b6ddd3] text-[#0f1714]" : "border-gold-400/20 hover:border-[#b6ddd3]/60"}`}><Check className="h-2.5 w-2.5" strokeWidth={3} /></button>
                  <button type="button" aria-pressed={flags[check.id] === "flag"} aria-label={`${check.label}: flag for review or regenerate`} onClick={() => onFlag(check.id, "flag")}
                    className={`grid size-5 place-items-center rounded-full border transition ${flags[check.id] === "flag" ? "border-amber-300 bg-amber-300 text-[#1a160e]" : "border-gold-400/20 hover:border-amber-300/60"}`}><Flag className="h-2.5 w-2.5" /></button>
                </span>
              </li>
            ))}
          </ul>
          {flagged ? <p className="mt-2 text-[10px] text-amber-100">Flagged assets should be retried before use. Retry keeps the same references.</p> : null}
        </details>
      ) : null}
    </div>
  )
}
