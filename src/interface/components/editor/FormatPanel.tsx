'use client';

import { Check } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { useFilmstrip } from '@/interface/lib/media-thumbs';
import { DEFAULT_FRAME_FIT, FRAME_FITS, VIDEO_FORMATS, formatFor, type FrameFit } from '@/core/services/video-format';
import { parseResolution } from '@/core/services/timeline-render';

/**
 * A frame of the shot drawn exactly as the export will place it: in this shape, filled this way.
 * `box` is the longest side in pixels.
 */
function FramePreview({ frame, w, h, fit, box, active }: { frame: string | null; w: number; h: number; fit: FrameFit; box: number; active: boolean }) {
  const size = w >= h ? { width: box, height: (box * h) / w } : { height: box, width: (box * w) / h };
  return (
    <span
      className={`relative block overflow-hidden rounded-[6px] bg-black ring-1 transition-shadow ${active ? 'ring-gold-200 shadow-[0_8px_22px_-10px_rgba(217,192,138,0.8)]' : 'ring-white/20'}`}
      style={size}
    >
      {frame ? (
        <>
          {fit === 'blur' && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={frame} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover blur-[6px] brightness-90" />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frame} alt="" className={`absolute inset-0 h-full w-full ${fit === 'fill' ? 'object-cover' : 'object-contain'}`} />
        </>
      ) : (
        <span className="absolute inset-0 bg-[linear-gradient(135deg,#5a4a2e,#1c1712)]" />
      )}
    </span>
  );
}

/** Choose the frame shape (where the video will be watched) and how footage fills it. */
export function FormatPanel() {
  const { timeline, setFormat, clips, tracks, playhead_ms } = useTimelineStore();
  const current = formatFor(timeline?.resolution);
  const fit = (timeline?.frame_fit as FrameFit | undefined) ?? DEFAULT_FRAME_FIT;
  const [cw, ch] = parseResolution(current.resolution);

  // Every card shows the shot under the playhead, so the choice is made on your own picture.
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const shots = clips.filter((c) => c.track_id === videoTrack?.id);
  const shot = shots.find((c) => c.start_ms <= playhead_ms && c.end_ms > playhead_ms) ?? shots[0];
  const strip = useFilmstrip(shot?.asset_url);
  const frame = strip?.frames[Math.floor((strip.frames.length - 1) / 2)] ?? null;

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
                className={`relative flex flex-col items-center gap-2.5 rounded-2xl border px-3 pb-3 pt-3.5 text-center transition-all ${
                  active ? 'border-gold-300/80 bg-gold-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/25'
                }`}
              >
                <span className="grid h-[84px] place-items-center">
                  <FramePreview frame={frame} w={w} h={h} fit={fit} box={78} active={active} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">
                    {format.label} <span className="text-[#9aa3ad]">{format.ratio}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-[#9aa3ad]">{format.hint}</span>
                </span>
                {active && (
                  <span className="absolute right-2 top-2 grid size-5 place-items-center rounded-full bg-gold-200 text-[#1a160e]">
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
        <div className="grid grid-cols-3 gap-2">
          {FRAME_FITS.map((option) => {
            const active = option.id === fit;
            return (
              <button
                key={option.id}
                onClick={() => setFormat({ fit: option.id })}
                aria-pressed={active}
                title={option.hint}
                className={`relative flex flex-col items-center gap-2 rounded-xl border px-1.5 pb-2.5 pt-3 text-center transition-all ${
                  active ? 'border-gold-300/80 bg-gold-500/[0.08]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/25'
                }`}
              >
                <span className="grid h-[68px] place-items-center">
                  <FramePreview frame={frame} w={cw} h={ch} fit={option.id} box={64} active={active} />
                </span>
                <span className="block text-[12px] font-medium leading-tight text-white">{option.label}</span>
                <span className="block text-[10.5px] leading-snug text-[#9aa3ad]">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </section>
      <p className="text-xs leading-relaxed text-[#7d858f]">The preview above shows the new shape right away. Make video again to get a file in this shape.</p>
    </div>
  );
}
