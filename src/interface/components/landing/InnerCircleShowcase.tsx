'use client';

import { useEffect, useRef } from 'react';

/** A real Visiowave film under the form. It loads only when scrolled into view so the form stays fast. */
export function InnerCircleShowcase() {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const film = video.current;
    if (!film || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void film.play().catch(() => null);
        else film.pause();
      },
      { threshold: 0.35 }
    );
    observer.observe(film);
    return () => observer.disconnect();
  }, []);

  return (
    <section aria-label="A film made with Visiowave" className="py-10 sm:py-14">
      <div className="mb-4 flex items-end justify-between gap-4">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--ic-gold)]">Made with Visiowave</p>
        <p className="text-[12px] text-white/50">Night drive · 15 sec</p>
      </div>
      <div className="overflow-hidden rounded-[22px] border border-[var(--ic-line)] bg-black shadow-[0_40px_90px_-50px_rgba(0,0,0,0.9)]">
        <video
          ref={video}
          className="aspect-video w-full object-cover"
          poster="/landing-poster.webp?v=20260912"
          preload="none"
          muted
          loop
          playsInline
          controls
          aria-label="Cars racing through a rainy night city, generated in Visiowave"
        >
          <source src="/landing-720.mp4?v=20261013" type="video/mp4" media="(max-width: 760px)" />
          <source src="/landing.mp4?v=20260912-audio" type="video/mp4" />
        </video>
      </div>
    </section>
  );
}
