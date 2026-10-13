"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type * as React from "react"
import { AudioLines, Film, ImagePlus } from "lucide-react"
import { createClient } from "@/infrastructure/supabase/client"
import { Textarea } from "@/interface/components/ui/textarea"
import { REFERENCE_BUCKET, referenceRoles, type MediaReference } from "@/core/validation/media-reference"

const thumbs = new Map<string, string>()

function MentionThumb({ reference }: { reference: MediaReference }) {
  const [url, setUrl] = useState(() => thumbs.get(reference.assetPath) ?? "")
  useEffect(() => {
    if (reference.mediaType !== "image" || thumbs.has(reference.assetPath)) return
    let cancelled = false
    void createClient().storage.from(REFERENCE_BUCKET).createSignedUrl(reference.assetPath, 3600).then(({ data }) => {
      if (cancelled || !data) return
      thumbs.set(reference.assetPath, data.signedUrl)
      setUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [reference.assetPath, reference.mediaType])
  const Icon = reference.mediaType === "image" ? ImagePlus : reference.mediaType === "video" ? Film : AudioLines
  return (
    <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md border border-gold-400/20 bg-black/40 text-gold-300">
      {/* Signed private URLs must not pass through the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon className="size-3.5" />}
    </span>
  )
}

/** Pixel position of the caret inside a textarea, via an off-screen mirror with the same text metrics. */
function caretPosition(textarea: HTMLTextAreaElement, index: number) {
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  for (const prop of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "boxSizing", "wordSpacing", "textIndent"] as const) {
    mirror.style[prop] = style[prop]
  }
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", wordWrap: "break-word", top: "0", left: "-9999px", width: `${textarea.clientWidth}px` })
  mirror.textContent = textarea.value.slice(0, index)
  const marker = document.createElement("span")
  marker.textContent = "​"
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const top = marker.offsetTop - textarea.scrollTop
  const left = marker.offsetLeft
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4
  document.body.removeChild(mirror)
  return { top, left, lineHeight }
}

type Mention = { start: number; query: string }

/** "@" at the start or after whitespace, with an optional word query up to the caret. */
function findMention(value: string, caret: number): Mention | null {
  const match = value.slice(0, caret).match(/(^|\s)@([\w-]*)$/)
  return match ? { start: caret - match[2].length - 1, query: match[2].toLowerCase() } : null
}

/**
 * The idea box with @-mentions: typing "@" opens the panel's references (thumbnail, tag, roles)
 * at the caret; Enter/Tab or a tap inserts the tag (e.g. "@image1 ").
 */
export function MentionTextarea({ value, onChange, references, className, ...props }: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string
  onChange: (value: string) => void
  /** Labelled references (@image1…), in panel order. */
  references: MediaReference[]
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<Mention | null>(null)
  const [active, setActive] = useState(0)
  const [anchor, setAnchor] = useState({ top: 0, left: 0, above: false })
  const pendingCaret = useRef<number | null>(null)

  const options = useMemo(() => {
    if (!mention) return []
    return references.filter((item) => {
      const haystack = [item.label, item.label?.replace("@", ""), item.name, ...referenceRoles(item), item.mediaType].join(" ").toLowerCase()
      return !mention.query || haystack.includes(mention.query)
    })
  }, [mention, references])

  const sync = (target: HTMLTextAreaElement) => {
    const next = findMention(target.value, target.selectionStart ?? 0)
    setMention(next)
    setActive(0)
    if (!next) return
    const caret = caretPosition(target, next.start)
    const room = window.innerHeight - (target.getBoundingClientRect().top + caret.top + caret.lineHeight)
    const left = Math.max(0, Math.min(caret.left, target.clientWidth - 260))
    setAnchor({ top: caret.top + caret.lineHeight + 4, left, above: room < 260 })
  }

  const insert = (item: MediaReference) => {
    if (!mention || !item.label) return
    const caret = ref.current?.selectionStart ?? value.length
    const tag = `${item.label} `
    const next = value.slice(0, mention.start) + tag + value.slice(caret).replace(/^ /, "")
    pendingCaret.current = mention.start + tag.length
    setMention(null)
    onChange(next)
  }

  // Put the caret right after the inserted tag once React has rendered the new value.
  useLayoutEffect(() => {
    const node = ref.current
    if (node && pendingCaret.current !== null) {
      node.focus()
      node.setSelectionRange(pendingCaret.current, pendingCaret.current)
      pendingCaret.current = null
    }
  }, [value])

  const open = Boolean(mention)
  const listId = `${props.id ?? "prompt"}-mentions`

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${options[active].id}` : undefined}
        onChange={(event) => { onChange(event.target.value); sync(event.target) }}
        onClick={(event) => sync(event.currentTarget)}
        onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) sync(event.currentTarget) }}
        onBlur={() => window.setTimeout(() => setMention(null), 120)}
        onKeyDown={(event) => {
          if (!open) return props.onKeyDown?.(event)
          if (event.key === "Escape") { event.preventDefault(); setMention(null); return }
          if (!options.length) return
          if (event.key === "ArrowDown") { event.preventDefault(); setActive((i) => (i + 1) % options.length) }
          else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => (i - 1 + options.length) % options.length) }
          else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); insert(options[active]) }
        }}
      />
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Your references"
          style={{ left: anchor.left, ...(anchor.above ? { bottom: `calc(100% - ${anchor.top - 8}px)` } : { top: anchor.top }) }}
          className="absolute z-50 w-[min(260px,100%)] overflow-hidden rounded-xl border border-gold-400/25 bg-[#121412]/98 p-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl"
        >
          {references.length === 0 ? (
            <p className="px-3 py-2.5 text-[12.5px] leading-snug text-[#B0B8C4]">No references added yet. Upload in the Media panel under More options.</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2.5 text-[12.5px] text-[#B0B8C4]">No reference matches “{mention?.query}”.</p>
          ) : options.map((item, index) => (
            <button
              key={item.id}
              id={`${listId}-${item.id}`}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => { event.preventDefault(); insert(item) }}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${index === active ? "bg-[#E5A93C]/15 ring-1 ring-inset ring-[#E5A93C]/70" : "hover:bg-white/[0.04]"}`}
            >
              <MentionThumb reference={item} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[#f3eee2]">
                  {item.mediaType[0].toUpperCase() + item.mediaType.slice(1)} {item.label?.replace(/\D/g, "")}
                  <span className="ml-1.5 text-[11px] font-normal text-gold-300/80">{item.label}</span>
                </span>
                <span className="block truncate text-[11.5px] capitalize text-[#B0B8C4]">{referenceRoles(item).join(" · ")}{item.applied ? "" : " · not applied"}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
