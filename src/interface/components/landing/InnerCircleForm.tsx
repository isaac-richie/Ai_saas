'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type FormState = {
  fullName: string;
  instagramHandle: string;
  socialHandle: string;
  email: string;
};

const initialState: FormState = {
  fullName: '',
  instagramHandle: '',
  socialHandle: '',
  email: '',
};

export function InnerCircleForm({ referredByCode }: { referredByCode: string | null }) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return (
      state.fullName.trim().length > 1 &&
      state.instagramHandle.trim().length > 1 &&
      state.socialHandle.trim().length > 1 &&
      state.email.includes('@')
    );
  }, [state]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/inner-circle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...state,
          referredByCode,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; referralCode: string }
        | { error?: string }
        | null;

      if (!response.ok || !payload || !('ok' in payload)) {
        setError(payload && 'error' in payload ? payload.error || 'Signup failed.' : 'Signup failed.');
        return;
      }

      const params = new URLSearchParams({
        code: payload.referralCode,
        name: state.fullName,
      });
      router.push(`/inner-circle/thanks?${params.toString()}`);
    } catch {
      setError('Could not submit right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          value={state.fullName}
          onChange={(value) => setState((prev) => ({ ...prev, fullName: value }))}
          placeholder="Your full name"
          required
        />
        <Field
          label="Instagram Handle"
          value={state.instagramHandle}
          onChange={(value) => setState((prev) => ({ ...prev, instagramHandle: value }))}
          placeholder="@yourhandle"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="TikTok / Twitter Handle"
          value={state.socialHandle}
          onChange={(value) => setState((prev) => ({ ...prev, socialHandle: value }))}
          placeholder="@yourhandle"
          required
        />
        <Field
          label="Email"
          type="email"
          value={state.email}
          onChange={(value) => setState((prev) => ({ ...prev, email: value }))}
          placeholder="you@example.com"
          required
        />
      </div>

      {referredByCode ? (
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">
          Referred by code: {referredByCode}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="beam-button inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#00E5FF] via-[#35A6FF] to-[#FF7A59] px-6 py-3 text-sm font-semibold text-black transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting ? 'SUBMITTING...' : 'GET EXCLUSIVE ACCESS'}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  type?: 'text' | 'email';
}) {
  return (
    <label className="block space-y-2 text-sm text-white/80">
      <span className="text-[11px] uppercase tracking-[0.16em] text-white/55">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-white placeholder:text-white/30 outline-none transition focus:border-cyan-300/70"
      />
    </label>
  );
}
