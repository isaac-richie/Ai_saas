"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronDown, Loader2, Plus, Search, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { deleteProductions } from "@/core/actions/production"

export type PickerFilm = { id: string; title: string; status: "brief" | "awaiting_approval" | "approved"; createdAt?: string | null }

const STATUS: Record<PickerFilm["status"], { label: string; tone: string }> = {
  brief: { label: "Draft", tone: "border-white/15 text-[#B0B8C4]" },
  awaiting_approval: { label: "Ready to approve", tone: "border-gold-300/40 text-gold-200" },
  approved: { label: "In production", tone: "border-emerald-300/35 text-emerald-200" },
}

/**
 * The Longer film production switcher: search, status at a glance, and cleanup. Each row deletes
 * after an inline confirmation; "Clear drafts" removes every unplanned brief except the open one.
 */
export function ProductionPicker({ films, selectedId, disabled, onSelect, onDeleted }: {
  films: PickerFilm[]
  selectedId: string | null
  disabled?: boolean
  onSelect: (id: string | null) => void
  onDeleted: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const selected = films.find((film) => film.id === selectedId)
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? films.filter((film) => film.title.toLowerCase().includes(q)) : films
  }, [films, query])
  const drafts = films.filter((film) => film.status === "brief" && film.id !== selectedId)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape) }
  }, [open])

  async function remove(ids: string[], label: string) {
    setDeleting(ids.length === 1 ? ids[0] : "all")
    const result = await deleteProductions(ids)
    setDeleting(null); setConfirmId(null); setConfirmClear(false)
    if (result.error) { toast.error(result.error); return }
    toast.success(label)
    onDeleted(ids)
  }

  return (
    <div ref={root} className="relative min-w-0 flex-1">
      <span className="mb-1.5 block text-[13px] font-medium text-[#ece6d6]">Production</span>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="group flex h-12 w-full items-center gap-3 rounded-2xl border border-gold-400/20 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] px-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition hover:border-gold-400/45 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] text-[#f3eee2]">{selected ? selected.title : "Start a new film"}</span>
        </span>
        {selected ? <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] sm:inline ${STATUS[selected.status].tone}`}>{STATUS[selected.status].label}</span> : null}
        <ChevronDown className={`size-4 shrink-0 text-gold-300/80 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-2xl border border-gold-400/25 bg-[#101210]/98 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.95)] backdrop-blur-xl sm:min-w-[440px]">
          <div className="flex items-center gap-2 border-b border-white/[0.06] p-2.5">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gold-300/70" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={films.length ? `Search ${films.length} production${films.length === 1 ? "" : "s"}` : "Search productions"}
                aria-label="Search productions"
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/40 pl-9 pr-3 text-[13px] text-white placeholder:text-white/35 focus:border-gold-400/50 focus:outline-none"
              />
            </label>
            <button type="button" onClick={() => { onSelect(null); setOpen(false) }} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a)] px-3 text-[12.5px] font-semibold text-[#1a160e]">
              <Plus className="size-4" /> New film
            </button>
          </div>
          <ul role="listbox" aria-label="Productions" className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
            {shown.length === 0 ? <li className="px-3 py-6 text-center text-[13px] text-[#B0B8C4]">{films.length === 0 ? "No productions yet. Tap New film to start one." : <>No production matches &ldquo;{query}&rdquo;.</>}</li> : null}
            {shown.map((film) => {
              const active = film.id === selectedId
              const confirming = confirmId === film.id
              return (
                <li key={film.id} role="option" aria-selected={active} className={`group/row relative rounded-xl transition ${active ? "bg-gold-400/[0.09]" : "hover:bg-white/[0.04]"}`}>
                  {confirming ? (
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <span className="flex-1 text-[13px] text-[#ece6d6]">Delete this production draft?</span>
                      <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-[#B0B8C4] hover:text-white">Keep</button>
                      <button type="button" disabled={deleting === film.id} onClick={() => void remove([film.id], "Production deleted")} className="flex items-center gap-1.5 rounded-lg border border-rose-300/40 bg-rose-500/15 px-2.5 py-1.5 text-[12px] text-rose-50 hover:bg-rose-500/25">
                        {deleting === film.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Delete
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <button type="button" onClick={() => { onSelect(film.id); setOpen(false) }} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left">
                        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${active ? "bg-gold-300 text-[#1a160e]" : "border border-white/15"}`}>{active ? <Check className="size-3" strokeWidth={3} /> : null}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] text-[#f3eee2]">{film.title}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-[#9aa1ab]">
                            <span className={`rounded-full border px-1.5 py-px ${STATUS[film.status].tone}`}>{STATUS[film.status].label}</span>
                            {film.createdAt ? new Date(film.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${film.title}`}
                        onClick={() => setConfirmId(film.id)}
                        className="mr-2 grid size-8 shrink-0 place-items-center rounded-lg text-[#9aa1ab] opacity-100 transition hover:bg-rose-500/15 hover:text-rose-200 md:opacity-0 md:group-hover/row:opacity-100 md:focus-visible:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {drafts.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2.5">
              {confirmClear ? (
                <>
                  <span className="text-[12.5px] text-[#ece6d6]">Delete {drafts.length} unplanned draft{drafts.length === 1 ? "" : "s"}?</span>
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => setConfirmClear(false)} className="rounded-lg px-2.5 py-1.5 text-[12px] text-[#B0B8C4] hover:text-white">Keep</button>
                    <button type="button" disabled={deleting === "all"} onClick={() => void remove(drafts.map((film) => film.id), `${drafts.length} draft${drafts.length === 1 ? "" : "s"} cleared`)} className="flex items-center gap-1.5 rounded-lg border border-rose-300/40 bg-rose-500/15 px-2.5 py-1.5 text-[12px] text-rose-50">
                      {deleting === "all" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}Clear
                    </button>
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[11.5px] text-[#9aa1ab]">{drafts.length} unplanned draft{drafts.length === 1 ? "" : "s"}</span>
                  <button type="button" onClick={() => setConfirmClear(true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] text-[#B0B8C4] transition hover:bg-white/[0.05] hover:text-white"><X className="size-3.5" />Clear drafts</button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
