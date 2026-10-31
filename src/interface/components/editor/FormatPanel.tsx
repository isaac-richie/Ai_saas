'use client';

import { Check } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { DEFAULT_FRAME_FIT, FRAME_FITS, VIDEO_FORMATS, formatFor, type FrameFit } from '@/core/services/video-format';
import { parseResolution } from '@/core/services/timeline-render';

/** Choose the frame shape (where the video will be watched) and how footage fills it. */
export function FormatPanel() {
  const { timeline, setFormat } = useTimelineStore();
  const current = formatFor(timeline?.resolution);
  const fit = (timeline?.frame_fit as FrameFit | undefined) ?? DEFAULT_FRAME_FIT;

  return (
    <div className="space-y-6 p-4">
      <section className="space-y-2.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b0b8c4]">Where will people watch it?</h4>
        <div className="grid grid-cols-2 gap-2.5">
          {VIDEO_FORMATS.map((format) => {
            const active = format.id === current.id;
            const [w, h] = parseResolution(format.resolution);
            return (
              <button
                key={format.id}
                onClick={() => setFormat({ resolution: format.resolution })}
                aria-pressed={active}
                className={`relative flex flex-col items-center gap-2.5 rounded-2xl border px-3 pb-3 pt-4 text-center transition-colors ${
                  active ? 'border-gold-300/80 bg-gold-500/10' : 'border-line bg-white/[0.02] hover:border-white/25'
                }`}
              >
                <span className="grid h-14 place-items-center">
                  <span
                    className={`block rounded-[5px] border-2 ${active ? 'border-gold-200 bg-gold-300/15' : 'border-white/40'}`}
                    style={w >= h ? { width: 56, height: (56 * h) / w } : { height: 56, width: (56 * w) / h }}
                  />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">
                    {format.label} <span className="text-[#9aa3ad]">{format.ratio}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-[#b0b8c4]">{format.hint}</span>
                </span>
                {active && (
                  <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-gold-300 text-[#1a160e]">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b0b8c4]">When a shot is a different shape</h4>
        <div className="grid gap-2">
          {FRAME_FITS.map((option) => {
            const active = option.id === fit;
            return (
              <button
                key={option.id}
                onClick={() => setFormat({ fit: option.id })}
                aria-pressed={active}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  active ? 'border-gold-300/80 bg-gold-500/10' : 'border-line bg-white/[0.02] hover:border-white/25'
                }`}
              >
                <FitIcon fit={option.id} active={active} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-white">{option.label}</span>
                  <span className="block text-xs text-[#b0b8c4]">{option.hint}</span>
                </span>
                {active && <Check size={16} className="shrink-0 text-gold-200" />}
              </button>
            );
          })}
        </div>
      </section>
      <p className="text-xs leading-relaxed text-[#9aa3ad]">The preview shows the new shape right away. Make video again to get a file in this shape.</p>
    </div>
  );
}

/** A tiny vertical frame showing how a wide shot sits inside it. */
function FitIcon({ fit, active }: { fit: FrameFit; active: boolean }) {
  const shot = active ? 'bg-gold-200' : 'bg-white/70';
  return (
    <span className={`relative h-10 w-6 shrink-0 overflow-hidden rounded-[4px] border ${active ? 'border-gold-200/80' : 'border-white/30'} bg-black`}>
      {fit === 'blur' && <span className={`absolute inset-0 ${shot} opacity-25 blur-[2px]`} />}
      {fit === 'fill' ? (
        <span className={`absolute inset-0 ${shot} opacity-90`} />
      ) : (
        <span className={`absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 ${shot}`} />
      )}
    </span>
  );
}
