'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function InnerCircleForm({ referredByCode }: { referredByCode: string | null }) {
  const [email, setEmail] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Focus the email field on desktop only; on phones it would pop the keyboard over the headline.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) emailRef.current?.focus();
  }, []);

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
        body: JSON.stringify({ email: email.trim(), socialHandle: socialHandle.trim(), feedback: feedback.trim(), referredByCode }),
      });
      const payload = (await response.json().catch(() => null)) as { ok: true } | { error?: string } | null;
      if (!response.ok || !payload || !('ok' in payload)) {
        setError(payload && 'error' in payload && payload.error ? payload.error : 'Signup failed. Please try again.');
        return;
      }
      setJoined(true);
    } catch {
      setError('Could not submit right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (joined) {
    return (
      <div role="status" className="mt-8 flex items-start gap-3 rounded-2xl border border-gold-300/30 bg-gold-300/[0.06] p-5">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-gold-300" />
        <p className="text-base leading-relaxed text-white/85">
          You are on the Inner Circle list. Check your email for your private access invite.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
      <Field label="Email address" htmlFor="inner-circle-email">
        <input
          id="inner-circle-email"
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={160}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          aria-invalid={Boolean(error) && !EMAIL_PATTERN.test(email.trim())}
          className={inputClass}
        />
      </Field>

      <Field label="Primary social handle (optional)" htmlFor="inner-circle-handle">
        <input
          id="inner-circle-handle"
          type="text"
          autoComplete="off"
          value={socialHandle}
          onChange={(event) => setSocialHandle(event.target.value)}
          maxLength={120}
          autoCapitalize="none"
          spellCheck={false}
          placeholder="@yourhandle (IG / X / TikTok)"
          className={inputClass}
        />
      </Field>

      <Field label="What is the #1 problem with current AI video tools? (optional)" htmlFor="inner-circle-feedback">
        <textarea
          id="inner-circle-feedback"
          rows={3}
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          maxLength={1000}
          placeholder="e.g. character consistency across cuts, singing lip-sync..."
          className={`${inputClass} resize-none`}
        />
      </Field>

      {referredByCode ? (
        <p className="text-xs uppercase tracking-[0.18em] text-gold-300/80">Referred by code: {referredByCode}</p>
      ) : null}

      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="beam-button inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f3e5c0] via-[#d9c08a] to-[#b08d52] px-6 py-3 text-sm font-semibold text-black transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'JOINING…' : 'GET EXCLUSIVE ACCESS'}
      </button>
    </form>
  );
}

// 16px text keeps iOS Safari from zooming into the field on focus.
const inputClass =
  'w-full rounded-xl border border-gold-400/[0.12] bg-white/[0.03] px-4 py-3 text-base text-white placeholder:text-white/30 outline-none transition focus:border-gold-300/70';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-[11px] uppercase tracking-[0.16em] text-white/55">
        {label}
      </label>
      {children}
    </div>
  );
}
