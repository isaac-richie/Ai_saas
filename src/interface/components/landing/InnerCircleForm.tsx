'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Loader2, Mail, Share2 } from 'lucide-react';
import styles from '@/app/inner-circle/inner-circle.module.css';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FEEDBACK_LIMIT = 1000;

/** One tap answers the optional question; most people would otherwise skip it. */
const PROBLEMS = [
  'Characters change between shots',
  'Lip-sync looks off',
  'Clips are too short',
  'Hard to control the camera',
  'Too expensive',
];

const COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'aol.com', 'proton.me'];

/** Catches "gmial.com" and "gmail.co" before they cost us a lead. */
function suggestEmail(value: string): string | null {
  const [local, domain] = value.trim().toLowerCase().split('@');
  if (!local || !domain || COMMON_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDistance = 3;
  for (const candidate of COMMON_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best && bestDistance <= 2 ? `${local}@${best}` : null;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

type Joined = { referralCode: string | null; isNew: boolean };

export function InnerCircleForm({ referredByCode }: { referredByCode: string | null }) {
  const [email, setEmail] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const suggestion = useMemo(() => (emailTouched ? suggestEmail(email) : null), [email, emailTouched]);
  const emailInvalid = Boolean(error) && !EMAIL_PATTERN.test(email.trim());
  const answer = [...problems, feedback.trim()].filter(Boolean).join('; ').slice(0, FEEDBACK_LIMIT);

  // Focus the email field on desktop only; on phones it would pop the keyboard over the headline.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) emailRef.current?.focus({ preventScroll: true });
  }, []);

  function toggleProblem(problem: string) {
    setProblems((current) => (current.includes(problem) ? current.filter((item) => item !== problem) : [...current, problem]));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.');
      emailRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/inner-circle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), socialHandle: socialHandle.trim(), feedback: answer, referredByCode }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; referralCode?: string; isNew?: boolean }
        | { error?: string }
        | null;
      if (!response.ok || !payload || !('ok' in payload)) {
        setError(payload && 'error' in payload && payload.error ? payload.error : 'Something went wrong. Please try again.');
        return;
      }
      setJoined({ referralCode: payload.referralCode ?? null, isNew: payload.isNew !== false });
    } catch {
      setError('We could not reach Visiowave. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (joined) return <Success joined={joined} />;

  return (
    <form onSubmit={onSubmit} noValidate className={`${styles.card} p-5 sm:p-8`} aria-labelledby="inner-circle-form-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="inner-circle-form-title" className="text-[22px] font-medium tracking-[-0.01em]">
          Request your invite
        </h2>
        <span className="text-[12px] text-white/55">About 20 seconds</span>
      </div>

      <div className="mt-6 space-y-2">
        <label htmlFor="inner-circle-email" className="block text-[13px] text-[var(--ic-paper)]">
          Email address
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
          <input
            id="inner-circle-email"
            ref={emailRef}
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="go"
            required
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            onBlur={() => setEmailTouched(true)}
            maxLength={160}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            aria-invalid={emailInvalid}
            aria-describedby={error ? 'inner-circle-error' : undefined}
            className={`${styles.field} h-[52px] pl-11 pr-4`}
          />
        </div>
        {suggestion ? (
          <button
            type="button"
            onClick={() => {
              setEmail(suggestion);
              setEmailTouched(false);
            }}
            className="text-[13px] text-[var(--ic-gold-soft)] underline decoration-[var(--ic-line)] underline-offset-4 hover:decoration-[var(--ic-gold)]"
          >
            Did you mean <strong className="font-medium">{suggestion}</strong>?
          </button>
        ) : null}
      </div>

      <div className="mt-5 space-y-2">
        <label htmlFor="inner-circle-handle" className="flex items-baseline justify-between text-[13px] text-[var(--ic-paper)]">
          Your main social handle <span className="text-[12px] text-white/50">IG, X or TikTok · Optional</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-white/40" aria-hidden="true">
            @
          </span>
          <input
            id="inner-circle-handle"
            type="text"
            autoComplete="off"
            value={socialHandle}
            onChange={(event) => setSocialHandle(event.target.value.replace(/^@+/, ''))}
            maxLength={120}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="yourhandle"
            className={`${styles.field} h-[52px] pl-9 pr-4`}
          />
        </div>
      </div>

      <fieldset className="mt-5 space-y-3">
        <legend className="flex w-full items-baseline justify-between text-[13px] text-[var(--ic-paper)]">
          What&apos;s the #1 problem with AI video tools today? <span className="ml-3 shrink-0 text-[12px] text-white/50">Optional</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {PROBLEMS.map((problem) => (
            <button
              key={problem}
              type="button"
              aria-pressed={problems.includes(problem)}
              onClick={() => toggleProblem(problem)}
              className={styles.chip}
            >
              {problems.includes(problem) ? <Check className="-ml-0.5 mr-1 inline size-3.5 align-[-2px]" aria-hidden="true" /> : null}
              {problem}
            </button>
          ))}
        </div>
        <label htmlFor="inner-circle-feedback" className="sr-only">
          Anything else? (optional)
        </label>
        <textarea
          id="inner-circle-feedback"
          rows={3}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          maxLength={FEEDBACK_LIMIT}
          placeholder="Or tell us in your own words…"
          className={`${styles.field} resize-none px-4 py-3`}
        />
      </fieldset>

      <div aria-live="polite" className="min-h-0">
        {error ? (
          <p id="inner-circle-error" role="alert" className="mt-4 rounded-xl border border-red-300/25 bg-red-400/[0.07] px-4 py-3 text-[14px] text-red-200">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className={`${styles.cta} mt-6 inline-flex min-h-[54px] w-full items-center justify-center gap-2.5 px-6 text-[13px]`}
      >
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'JOINING…' : 'GET EXCLUSIVE ACCESS'}
      </button>

      <p className="mt-4 text-center text-[13px] leading-relaxed text-white/60">
        By joining, you agree that we may contact you about the beta.{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-white">Privacy</Link>
      </p>
    </form>
  );
}

function Success({ joined }: { joined: Joined }) {
  const [copied, setCopied] = useState(false);
  // This panel only renders after a submit in the browser, never on the server.
  const [origin] = useState(() => window.location.origin);
  const [canShare] = useState(() => typeof navigator.share === 'function');
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const inviteLink = joined.referralCode && origin ? `${origin}/inner-circle?ref=${joined.referralCode}` : null;

  async function copy() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* Clipboard blocked; the link stays selectable on screen. */
    }
  }

  async function share() {
    if (!inviteLink) return;
    try {
      await navigator.share({
        title: 'The Inner Circle · Visiowave Studios',
        text: 'Visiowave is opening a private beta for AI filmmakers. Request an invite:',
        url: inviteLink,
      });
    } catch {
      /* Dismissed by the user. */
    }
  }

  return (
    <div role="status" className={`${styles.card} p-6 text-center sm:p-10`}>
      <svg className={`${styles.seal} mx-auto text-[var(--ic-gold)]`} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle className={styles.sealRing} cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="1.5" />
        <path className={styles.sealCheck} d="M21 33.5 28.5 41 43 25" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="mt-6 text-[11px] uppercase tracking-[0.28em] text-[var(--ic-gold)]">
        {joined.isNew ? 'Request received' : 'Already on the list'}
      </p>
      <h2 ref={headingRef} tabIndex={-1} className="mt-3 text-[28px] font-medium leading-tight tracking-[-0.01em] outline-none sm:text-[32px]">
        You&apos;re on the <span className={`${styles.serif} text-[var(--ic-gold-soft)]`}>waitlist.</span>
      </h2>
      <p className="mx-auto mt-4 max-w-sm text-[16px] leading-relaxed text-[var(--ic-muted)]">
        {joined.isNew
          ? "We'll contact you if you're selected for the beta."
          : "We've saved your latest answers. We'll contact you if you're selected for the beta."}
      </p>

      {inviteLink ? (
        <div className="mt-8 rounded-2xl border border-[var(--ic-line)] bg-black/30 p-4 text-left">
          <p className="text-[14px] font-medium text-[var(--ic-paper)]">Know a creator who&apos;d love this?</p>
          <p className="mt-1 text-[13px] text-white/55">Share your private invite link.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all break-all rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[13px] leading-snug text-[var(--ic-gold-soft)]">
              {inviteLink.replace(/^https?:\/\//, '')}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--ic-line)] px-3 text-[13px] text-[var(--ic-paper)] transition hover:border-[var(--ic-gold)]"
            >
              {copied ? <Check className="size-4 text-[var(--ic-gold)]" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {canShare ? (
            <button
              type="button"
              onClick={share}
              className={`${styles.cta} mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 text-[12px]`}
            >
              <Share2 className="size-4" aria-hidden="true" /> SHARE INVITE
            </button>
          ) : null}
        </div>
      ) : null}

      <Link href="/" className="mt-6 inline-block text-[14px] text-white/60 underline-offset-4 hover:text-white hover:underline">
        Explore Visiowave
      </Link>
    </div>
  );
}
