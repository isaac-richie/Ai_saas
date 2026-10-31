'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Clapperboard, Maximize2, Play } from 'lucide-react';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';
import { timelineToOutputMs } from '@/core/services/timeline-ops';
import { isCaptionStyle } from '@/core/services/captions';
import { parseResolution } from '@/core/services/timeline-render';
import { getGradeById } from '@/core/services/color-grading';
import { DEFAULT_FRAME_FIT, isFrameFit } from '@/core/services/video-format';
import { CAPTION_PREVIEW_CLASS, GRADE_PREVIEW_FILTER } from './labels';

/**
 * The stage. It fills its box at the timeline's aspect ratio, plays shots, music and text in
 * step with the playhead, and approximates the chosen look so edits are visible right away.
 */
export function PreviewPlayer({ emptyHint }: { emptyHint?: React.ReactNode }) {
  const { clips, playhead_ms, tracks, is_playing, timeline, setPlayhead, setPlaying, togglePlay } = useTimelineStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const backRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const videoTrack = tracks.find((t) => t.track_type === 'video');
  const musicTrack = tracks.find((t) => t.track_type === 'audio');
  const captionTrack = tracks.find((t) => t.track_type === 'caption');
  const videoClips = useMemo(
    () => clips.filter((c) => c.track_id === videoTrack?.id).sort((a, b) => a.start_ms - b.start_ms),
    [clips, videoTrack?.id],
  );
  const endMs = videoClips.length ? videoClips[videoClips.length - 1].end_ms : 0;
  const index = videoClips.findIndex((c) => c.start_ms <= playhead_ms && c.end_ms > playhead_ms);
  const current = index >= 0 ? videoClips[index] : null;
  const next = index >= 0 ? videoClips[index + 1] : videoClips[0];
  const outputMs = timelineToOutputMs(videoClips, playhead_ms);

  const song = clips.find((c) => c.track_id === musicTrack?.id);
  const caption = captionTrack?.visible
    ? clips.find((c) => c.track_id === captionTrack.id && c.start_ms <= outputMs && c.end_ms > outputMs)
    : undefined;
  const captionMeta = (caption?.metadata || {}) as { text?: string; style?: string };
  const captionStyle = isCaptionStyle(captionMeta.style) ? captionMeta.style : 'standard';
  const grade = current?.color_grade_id || timeline?.color_grade_id || 'natural';
  const [w, h] = parseResolution(timeline?.resolution);
  const fit = isFrameFit(timeline?.frame_fit) ? timeline.frame_fit : DEFAULT_FRAME_FIT;

  useEffect(() => {
    if (!is_playing) return;
    if (endMs === 0) {
      setPlaying(false);
      return;
    }
    if (useTimelineStore.getState().playhead_ms >= endMs) setPlayhead(0);
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const at = useTimelineStore.getState().playhead_ms;
      const nextMs = at + (now - last);
      last = now;
      if (nextMs >= endMs) {
        setPlayhead(endMs);
        setPlaying(false);
        return;
      }
      setPlayhead(nextMs);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [is_playing, endMs, setPlayhead, setPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !current) return;
    const target = (playhead_ms - current.start_ms + current.trim_start_ms) / 1000;
    if (Math.abs(video.currentTime - target) > 0.25) video.currentTime = target;
    video.volume = Math.max(0, Math.min(1, current.volume));
    video.muted = Boolean(videoTrack?.muted);
    if (is_playing && video.paused) video.play().catch(() => {});
    if (!is_playing && !video.paused) video.pause();
    // The blurred background is a second, silent copy kept in step with the picture.
    const back = backRef.current;
    if (back) {
      if (Math.abs(back.currentTime - video.currentTime) > 0.15) back.currentTime = video.currentTime;
      if (is_playing && back.paused) back.play().catch(() => {});
      if (!is_playing && !back.paused) back.pause();
    }
  }, [playhead_ms, current, is_playing, videoTrack?.muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) return;
    const inside = outputMs >= song.start_ms && outputMs < song.end_ms;
    const target = (outputMs - song.start_ms + song.trim_start_ms) / 1000;
    if (inside && Math.abs(audio.currentTime - target) > 0.3) audio.currentTime = target;
    audio.volume = Math.max(0, Math.min(1, song.volume));
    audio.muted = Boolean(musicTrack?.muted);
    if (is_playing && inside && audio.paused) audio.play().catch(() => {});
    if ((!is_playing || !inside) && !audio.paused) audio.pause();
  }, [outputMs, song, is_playing, musicTrack?.muted]);

  const fullscreen = () => {
    const el = frameRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  };

  return (
    <div className="grid h-full w-full place-items-center" style={{ containerType: 'size' }}>
      <div
        ref={frameRef}
        className="@container group/stage relative overflow-hidden rounded-xl bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_40px_80px_-40px_rgba(0,0,0,1)]"
        style={{ aspectRatio: `${w} / ${h}`, width: `min(100cqw, calc(100cqh * ${w / h}))` }}
      >
        {current?.asset_url && fit === 'blur' && (
          <video
            key={`back-${current.id}`}
            ref={backRef}
            src={current.asset_url}
            muted
            playsInline
            preload="auto"
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover"
            style={{ filter: `blur(18px) brightness(0.88) saturate(1.1) ${GRADE_PREVIEW_FILTER[grade] === 'none' ? '' : GRADE_PREVIEW_FILTER[grade] ?? ''}` }}
          />
        )}
        {current?.asset_url ? (
          <video
            key={current.id}
            ref={videoRef}
            src={current.asset_url}
            className={`relative h-full w-full transition-[filter] duration-300 ${fit === 'fill' ? 'object-cover' : 'object-contain'}`}
            style={{ filter: GRADE_PREVIEW_FILTER[grade] ?? 'none' }}
            playsInline
            preload="auto"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Clapperboard className="size-9 text-gold-300/50" strokeWidth={1.4} />
            <div className="text-sm text-[#d6d0c0]">{videoClips.length ? 'Move the playhead over a shot' : emptyHint ?? 'Your shots will play here'}</div>
          </div>
        )}
        {grade === 'cinematic-vignette' && current && (
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.55))]" />
        )}
        {caption && captionMeta.text && (
          <div className={`pointer-events-none absolute inset-x-[6%] text-center leading-tight ${CAPTION_PREVIEW_CLASS[captionStyle]}`} aria-live="off">
            {captionMeta.text}
          </div>
        )}

        {videoClips.length > 0 && (
          <button
            onClick={togglePlay}
            aria-label={is_playing ? 'Pause' : 'Play'}
            className="absolute inset-0 grid place-items-center focus-visible:outline-none"
          >
            <span
              className={`grid size-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md transition-all duration-300 @md:size-16 ${
                is_playing ? 'scale-75 opacity-0' : 'opacity-100 group-hover/stage:scale-105'
              }`}
            >
              <Play size={24} fill="currentColor" className="translate-x-0.5" />
            </span>
          </button>
        )}

        {current && (
          // Keyed by shot so, while playing, it shows briefly each time the picture changes.
          <div
            key={`badge-${index}-${is_playing}`}
            className={`pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white/90 backdrop-blur-md ${
              is_playing ? 'animate-[stage-badge_1.8s_ease_forwards]' : ''
            }`}
          >
            Shot {index + 1} <span className="text-white/50">of {videoClips.length}</span>
            {grade !== 'natural' && <span className="text-gold-200/90">· {getGradeById(grade)?.name}</span>}
          </div>
        )}
        {current && (
          <button
            onClick={fullscreen}
            aria-label="Full screen"
            className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-full bg-black/45 text-white/85 opacity-0 backdrop-blur-md transition-opacity hover:text-white focus-visible:opacity-100 group-hover/stage:opacity-100 pointer-coarse:hidden"
          >
            <Maximize2 size={14} />
          </button>
        )}

        {next?.asset_url && next.id !== current?.id && (
          <video key={`pre-${next.id}`} src={next.asset_url} preload="auto" muted className="hidden" aria-hidden />
        )}
        {song?.asset_url && <audio ref={audioRef} src={song.asset_url} preload="auto" className="hidden" />}
      </div>
    </div>
  );
}
