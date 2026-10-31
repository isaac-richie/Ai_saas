'use client';

import { Check } from 'lucide-react';
import { BUILT_IN_GRADES } from '@/core/services/color-grading';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { useFilmstrip } from '@/interface/lib/media-thumbs';
import { GRADE_PREVIEW_FILTER } from './labels';

/** Every look shown on a frame of the shot under the playhead, so choosing is seeing. */
export function ColorGradePicker({ selectedId, onSelect }: { selectedId: string; onSelect: (gradeId: string) => void }) {
  const { clips, tracks, playhead_ms } = useTimelineStore();
  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const shots = clips.filter((c) => c.track_id === videoTrack?.id);
  const shot = shots.find((c) => c.start_ms <= playhead_ms && c.end_ms > playhead_ms) ?? shots[0];
  const strip = useFilmstrip(shot?.asset_url);
  const frame = strip?.frames[Math.floor((strip.frames.length - 1) / 2)];

  return (
    <div className="space-y-3 p-4">
      <p className="text-sm text-[#b0b8c4]">Pick a look for the whole video. The preview changes right away.</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-2">
        {BUILT_IN_GRADES.map((grade) => {
          const active = selectedId === grade.id;
          return (
            <button
              key={grade.id}
              onClick={() => onSelect(grade.id)}
              aria-pressed={active}
              className={`group relative overflow-hidden rounded-xl border text-left transition-all ${
                active ? 'border-gold-300/80 shadow-[0_0_0_1px_#e3cf9f,0_10px_30px_-14px_rgba(217,192,138,0.8)]' : 'border-line hover:border-white/25'
              }`}
            >
              <div className="relative aspect-video overflow-hidden bg-black">
                {frame ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={frame}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    style={{ filter: GRADE_PREVIEW_FILTER[grade.id] ?? 'none' }}
                  />
                ) : (
                  <div className={`h-full w-full ${grade.thumbnail_css}`} />
                )}
                {grade.id === 'cinematic-vignette' && frame && (
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.6))]" />
                )}
              </div>
              <div className="px-2.5 py-2">
                <p className="text-sm font-medium text-white">{grade.name}</p>
                <p className="line-clamp-1 text-xs text-[#b0b8c4]">{grade.description}</p>
              </div>
              {active && (
                <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-gold-300 text-[#1a160e] shadow">
                  <Check size={14} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
