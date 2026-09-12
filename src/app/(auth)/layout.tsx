import Image from 'next/image';
import Link from 'next/link';
import { AnimatedBrandMark } from '@/interface/components/branding/AnimatedBrandMark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="cinema-site cinema-auth">
      <aside className="cinema-auth-art">
        <Image
          src="/studio-plate-2.webp"
          alt="A film crew at work on a warmly lit soundstage"
          fill
          priority
          sizes="(max-width: 900px) 100vw, 52vw"
        />
        <div className="cinema-auth-art-overlay" />
        <Link href="/" className="cinema-brand">
          <AnimatedBrandMark />
          <span>
            VISIOWAVE<small>STUDIOS</small>
          </span>
        </Link>
        <div className="cinema-auth-story">
          <span className="cinema-eyebrow">A SPACE FOR YOUR NEXT GREAT IDEA</span>
          <h2>
            Every story <br />
            needs a <br />
            <em>first frame.</em>
          </h2>
          <p>
            Bring your imagination.
            <br />
            Your studio is waiting.
          </p>
        </div>
        <div className="cinema-auth-credit">
          <span>VISIOWAVE / THE CREATIVE PROCESS</span>
          <span>01 — IN THE MAKING</span>
        </div>
      </aside>
      <section className="cinema-auth-panel">
        <header>
          <Link href="/" className="cinema-auth-back">
            Back to Visiowave
          </Link>
          <span className="cinema-eyebrow">STUDIO ACCESS</span>
        </header>
        <div className="cinema-auth-form">{children}</div>
        <footer>YOUR VISION. YOUR DIRECTION. YOUR STUDIO.</footer>
      </section>
    </div>
  );
}
