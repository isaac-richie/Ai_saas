'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  Play,
  Pause,
  Menu,
  X,
  Aperture,
  Film,
  Layers,
  WandSparkles,
} from 'lucide-react';
import { AnimatedBrandMark } from '@/interface/components/branding/AnimatedBrandMark';

export function CinematicLanding({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const destination = isAuthenticated ? '/dashboard/fast-video' : '/signup';
  const links = [
    ['#film', 'The film'],
    ['#craft', 'The craft'],
    ['#models', 'The tools'],
  ];

  useEffect(() => {
    if (!root.current || !('IntersectionObserver' in window)) return;
    const elements = root.current.querySelectorAll(
      '.cinema-section-heading, .cinema-features article, .cinema-editorial-copy, .cinema-invitation'
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove('cinema-awaiting');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12 }
    );
    elements.forEach((element) => {
      element.classList.add('cinema-reveal', 'cinema-awaiting');
      observer.observe(element);
    });
    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove('cinema-awaiting'));
    };
  }, []);

  async function toggleFilm() {
    if (!video.current) return;
    if (video.current.paused) {
      try {
        await video.current.play();
      } catch {
        setPlaying(false);
      }
    } else video.current.pause();
  }

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} className="cinema-site">
        <a className="cinema-skip" href="#cinema-content">
          Skip to content
        </a>
        <header className="cinema-nav cinema-wrap">
          <Link href="/" className="cinema-brand">
            <AnimatedBrandMark />
            <span>
              VISIOWAVE<small>STUDIOS</small>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="cinema-desktop-nav">
            {links.map(([href, title]) => (
              <a key={href} href={href}>
                {title}
              </a>
            ))}
          </nav>
          <Link href={destination} className="cinema-nav-cta">
            {isAuthenticated ? 'Enter studio' : 'Start creating'}
            <ArrowUpRight size={16} />
          </Link>
          <button
            className="cinema-menu-toggle"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="cinema-mobile-nav"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </header>
        {menuOpen && (
          <nav id="cinema-mobile-nav" className="cinema-mobile-nav" aria-label="Mobile navigation">
            {links.map(([href, title]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {title}
                <ArrowUpRight size={18} />
              </a>
            ))}
            <Link href="/login">
              Sign in
              <ArrowRight size={18} />
            </Link>
          </nav>
        )}
        <main id="cinema-content">
          <section className="cinema-hero cinema-wrap">
            <div className="cinema-eyebrow">
              <span className="cinema-dot" /> AN INDEPENDENT VISION. AN ENTIRE STUDIO.
            </div>
            <h1 className="cinema-title">
              Your imagination.
              <br />
              <em>In motion.</em>
              <span className="cinema-title-star" aria-hidden="true">
                ✳
              </span>
            </h1>
            <div className="cinema-hero-bottom">
              <p>
                A cinematic AI studio for the stories only you can tell.
                <br className="cinema-desktop-break" /> Direct the feeling. Shape the frame. Make
                your film.
              </p>
              <Link href={destination} className="cinema-button cinema-primary">
                {isAuthenticated ? 'Enter your studio' : 'Create your first frame'}
                <ArrowUpRight size={19} />
              </Link>
            </div>
            <div className="cinema-reel-heading">
              <span>VISIOWAVE / MOTION STUDY 001</span>
              <a href="#film">
                SCROLL TO EXPLORE <ArrowDown size={13} />
              </a>
            </div>
          </section>
          <section
            id="film"
            className="cinema-reel cinema-wrap"
            aria-label="Visiowave film showcase"
          >
            <div className="cinema-reel-screen">
              <video
                ref={video}
                poster="/landing-poster.webp"
                preload="none"
                playsInline
                loop
                controls={playing}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                aria-label="Visiowave cinematic showcase"
              >
                <source src="/landing.mp4" type="video/mp4" />
              </video>
              {!playing && (
                <div className="cinema-reel-caption">
                  <span className="cinema-eyebrow">A WORLD BEYOND THE PROMPT</span>
                  <p>
                    Every frame starts
                    <br />
                    with a <em>feeling.</em>
                  </p>
                </div>
              )}
              <button
                className="cinema-play"
                onClick={toggleFilm}
                aria-label={playing ? 'Pause showcase' : 'Play showcase'}
              >
                {playing ? <Pause size={20} /> : <Play size={20} />}
                <span>{playing ? 'Pause film' : 'Play the film'}</span>
              </button>
              <span className="cinema-frame-label">01 / AFTER HOURS</span>
            </div>
            <div className="cinema-reel-footer">
              <span>IMAGINATION, GIVEN FORM.</span>
              <span>TEXT TO VIDEO / IMAGE TO VIDEO</span>
            </div>
          </section>
          <section id="craft" className="cinema-craft cinema-wrap">
            <div className="cinema-section-heading">
              <span className="cinema-eyebrow">01 / THE CRAFT</span>
              <h2>
                You bring the vision.
                <br />
                We bring <em>the possibilities.</em>
              </h2>
              <p>
                From a passing thought to a carefully directed shot. A workspace that speaks your
                creative language.
              </p>
            </div>
            <div className="cinema-features">
              {[
                {
                  icon: WandSparkles,
                  title: 'An instinct for direction.',
                  body: 'Work with your AI Director to turn an idea into a detailed prompt, with intention behind the subject, lighting, and camera movement.',
                  number: '01',
                },
                {
                  icon: Aperture,
                  title: 'The details make the scene.',
                  body: 'Explore lens, framing, style, and motion controls. Start with words or a reference image, then shape the shot around your vision.',
                  number: '02',
                },
                {
                  icon: Layers,
                  title: 'Room to find your cut.',
                  body: 'Generate variations, save your favourites to the gallery, and bring your shots together. Keep the creative process in one place.',
                  number: '03',
                },
              ].map(({ icon: Icon, title, body, number }) => (
                <article key={number}>
                  <div>
                    <Icon strokeWidth={1} size={29} />
                    <span>{number}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="cinema-editorial">
            <div className="cinema-editorial-image">
              <Image
                src="/studio-plate-2.webp"
                alt="Film crew shaping a scene with a camera crane and studio lighting"
                fill
                sizes="(max-width: 760px) 100vw, 55vw"
              />
            </div>
            <div className="cinema-editorial-copy">
              <span className="cinema-eyebrow">MADE FOR THE DIRECTOR IN YOU</span>
              <h2>
                Less friction.
                <br />
                <em>More instinct.</em>
              </h2>
              <p>
                The magic is in your point of view. Fast Track gives you a focused space to explore
                it, without getting lost in the setup.
              </p>
              <Link href={destination} className="cinema-text-link">
                Find your next scene
                <ArrowUpRight size={20} />
              </Link>
              <div className="cinema-editorial-note">
                <Film size={17} /> FROM FIRST IDEA TO FINAL TAKE
              </div>
            </div>
          </section>
          <section id="models" className="cinema-models cinema-wrap">
            <div className="cinema-section-heading">
              <span className="cinema-eyebrow">02 / YOUR CREATIVE TOOLKIT</span>
              <h2>
                Three models.
                <br />
                <em>Your signature.</em>
              </h2>
              <p>
                Explore Kling, Seedance, and Sora from the same workspace. Choose your model and
                direct the result.
              </p>
            </div>
            <div className="cinema-model-list">
              {['Kling', 'Seedance', 'Sora'].map((model, i) => (
                <Link href={destination} key={model}>
                  <span className="cinema-model-index">0{i + 1}</span>
                  <h3>{model}</h3>
                  <span className="cinema-model-type">VIDEO GENERATION</span>
                  <ArrowUpRight strokeWidth={1} />
                </Link>
              ))}
            </div>
          </section>
          <section className="cinema-invitation cinema-wrap">
            <span className="cinema-eyebrow">THE NEXT FRAME IS YOURS</span>
            <h2>
              Make something
              <br />
              <em>worth feeling.</em>
            </h2>
            <Link href={destination} className="cinema-button cinema-primary">
              Start your story
              <ArrowUpRight size={20} />
            </Link>
          </section>
        </main>
        <footer className="cinema-footer cinema-wrap">
          <div className="cinema-footer-top">
            <Link href="/" className="cinema-brand">
              <AnimatedBrandMark />
              <span>
                VISIOWAVE<small>STUDIOS</small>
              </span>
            </Link>
            <p>
              Independent imagination.
              <br />
              Limitless frames.
            </p>
            <nav aria-label="Footer navigation">
              <Link href="/login">Sign in</Link>
              <a
                href="https://www.instagram.com/visiowavestudios"
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
                <ArrowUpRight size={13} />
              </a>
            </nav>
          </div>
          <div className="cinema-footer-bottom">
            <span>© {new Date().getFullYear()} Visiowave Studios</span>
            <span>IMAGINE. DIRECT. CREATE.</span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
