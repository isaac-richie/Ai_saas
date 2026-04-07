'use client';

import { useEffect, useMemo, useState } from 'react';
import { WandSparkles, Loader2, Copy, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Button } from '@/interface/components/ui/button';
import { Textarea } from '@/interface/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/interface/components/ui/select';
import type { StudioAdPacket } from '@/core/validation/studio-ad';

const MODES = [
  { value: 'cinematic_realism', label: 'Cinematic Realism' },
  { value: 'stylized_commercial', label: 'Stylized Commercial' },
  { value: 'music_video_experimental', label: 'Music Video Experimental' },
  { value: 'product_ad', label: 'Product Ad' },
  { value: 'narrative_continuity', label: 'Narrative Continuity' },
] as const;

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'runway', label: 'Runway' },
  { value: 'kie', label: 'Kie.ai' },
] as const;

export function StudioAdPanel({
  promptPreview,
  onApplyPacket,
  embedded = false,
  context,
}: {
  promptPreview: string;
  onApplyPacket?: (payload: {
    packet: StudioAdPacket;
    providerTarget: 'openai' | 'runway' | 'kie';
    outputType: 'image' | 'video';
    promptOverride?: string;
  }) => void;
  embedded?: boolean;
  context?: {
    projectId?: string;
    sceneId?: string;
    shotId?: string;
  };
}) {
  const [history, setHistory] = useState<
    Array<{
      id: string;
      created_at: string;
      user_intent: string;
      production_readiness: number;
      packet: StudioAdPacket;
    }>
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [intent, setIntent] = useState('');
  const [mode, setMode] = useState<(typeof MODES)[number]['value']>('cinematic_realism');
  const [providerTarget, setProviderTarget] = useState<(typeof PROVIDERS)[number]['value']>('openai');
  const [outputType, setOutputType] = useState<'image' | 'video'>('image');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packet, setPacket] = useState<StudioAdPacket | null>(null);

  const canSubmit = useMemo(() => intent.trim().length >= 8 && !loading, [intent, loading]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/ad/direct-shot?limit=6', { method: 'GET' });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok: true;
            data?: Array<{
              id: string;
              created_at: string;
              user_intent: string;
              production_readiness: number;
              packet: StudioAdPacket;
            }>;
          }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload || !('ok' in payload) || !payload.ok) return;
      setHistory(payload.data || []);
    } catch {
      // non-blocking
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, []);

  async function runDirector(options?: { forceFix?: boolean }) {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/ad/direct-shot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIntent: options?.forceFix
            ? `${intent.trim()}\n\nRefine this to production-ready quality. Remove ambiguity, improve technical clarity, and enforce cinematic specificity.`
            : intent.trim(),
          outputType,
          providerTarget,
          mode,
          context,
          projectBible: {
            aspectRatio: '16:9',
          },
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true; data: StudioAdPacket }
        | { ok: false; error?: string }
        | null;

      if (!response.ok || !payload || !('ok' in payload) || !payload.ok) {
        const message = payload && 'error' in payload ? payload.error : 'Studio AD failed.';
        setError(message || 'Studio AD failed.');
        return;
      }

      setPacket(payload.data);
      void loadHistory();
    } catch {
      setError('Unable to reach Studio AD. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // no-op
    }
  }

  const readiness = packet?.score.productionReadiness ?? 0;
  const readinessState =
    readiness >= 90 ? 'excellent' : readiness >= 80 ? 'good' : readiness >= 65 ? 'fair' : 'weak';
  const rootClassName = embedded
    ? 'space-y-3 rounded-xl border border-white/10 bg-black/20 p-3'
    : 'studio-card rounded-2xl p-5 text-white';
  const blockClassName = embedded
    ? 'rounded-lg border border-white/10 bg-black/20 p-3'
    : 'studio-subcard rounded-xl p-3';

  return (
    <div className={rootClassName}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center text-sm font-medium uppercase tracking-wider text-white/55">
          <WandSparkles className="mr-2 h-4 w-4 text-white/45" />
          Assistant Director
        </h3>
        <span className="text-[10px] uppercase tracking-[0.16em] text-cyan-300/75">Studio AD</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Direction Mode</p>
          <Select value={mode} onValueChange={(value) => setMode(value as (typeof MODES)[number]['value'])}>
            <SelectTrigger className="studio-field rounded-xl text-white">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b0f14] text-white shadow-[0_24px_48px_-30px_rgba(0,0,0,0.95)]">
              {MODES.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Target Provider</p>
          <Select
            value={providerTarget}
            onValueChange={(value) => setProviderTarget(value as (typeof PROVIDERS)[number]['value'])}
          >
            <SelectTrigger className="studio-field rounded-xl text-white">
              <SelectValue placeholder="Provider" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b0f14] text-white shadow-[0_24px_48px_-30px_rgba(0,0,0,0.95)]">
              {PROVIDERS.map((item) => (
                <SelectItem
                  key={item.value}
                  value={item.value}
                  className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100"
                >
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">Output Type</p>
          <Select value={outputType} onValueChange={(value) => setOutputType(value as 'image' | 'video')}>
            <SelectTrigger className="studio-field rounded-xl text-white">
              <SelectValue placeholder="Output" />
            </SelectTrigger>
            <SelectContent className="border-white/10 bg-[#0b0f14] text-white shadow-[0_24px_48px_-30px_rgba(0,0,0,0.95)]">
              <SelectItem value="image" className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100">
                Image
              </SelectItem>
              <SelectItem value="video" className="text-white/85 focus:bg-cyan-300/15 focus:text-cyan-100">
                Video
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <Textarea
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder="Describe the shot vibe, subject, camera feel, and mood..."
          className="studio-field min-h-28 rounded-xl text-white placeholder:text-white/35"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="studioGhost"
            onClick={() => setIntent(promptPreview || intent)}
            className="rounded-full text-xs"
          >
            Use Prompt Preview
          </Button>
          <Button
            type="button"
            variant="studio"
            onClick={() => void runDirector()}
            disabled={!canSubmit}
            className="rounded-xl"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Directing...
              </>
            ) : (
              'Direct This Shot'
            )}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
          {error}
        </div>
      ) : null}

      {packet ? (
        <div className="mt-5 space-y-3">
          <div className={blockClassName}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Production Readiness</p>
                <p className="mt-1 text-2xl font-semibold text-cyan-300">{packet.score.productionReadiness}%</p>
                <p className="mt-1 text-xs text-white/60">Strategy: {packet.strategy}</p>
              </div>
              <ReadinessGauge value={packet.score.productionReadiness} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
              <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                Continuity: {packet.score.continuityConfidence}%
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 p-2">
                Technical: {packet.score.technicalClarity}%
              </div>
            </div>
            {readinessState === 'weak' || readinessState === 'fair' ? (
              <div className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Prompt is not yet production-grade. Run auto-fix before applying.
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => runDirector({ forceFix: true })}
                  className="mt-2 h-7 rounded-full border border-amber-300/30 bg-amber-300/15 px-3 text-[11px] text-amber-100 hover:bg-amber-300/25"
                >
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  Fix to Production-Ready
                </Button>
              </div>
            ) : null}
          </div>

          <div className={blockClassName}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Master Prompt</p>
              <Button
                type="button"
                size="sm"
                variant="studioGhost"
                onClick={() => copyToClipboard(packet.masterPrompt)}
                className="h-7 rounded-full px-3 text-[11px]"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
            </div>
            <p className="mt-2 max-h-40 overflow-y-auto text-sm text-white/80">{packet.masterPrompt}</p>
            <Button
              type="button"
              variant="studioSecondary"
              onClick={() =>
                onApplyPacket?.({
                  packet,
                  providerTarget,
                  outputType,
                })
              }
              className="mt-3 w-full"
            >
              Apply Master Prompt to Shot Builder
            </Button>
          </div>

          <div className={blockClassName}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Negative Prompt</p>
            <p className="mt-2 max-h-24 overflow-y-auto text-sm text-white/75">{packet.negativePrompt}</p>
          </div>

          <div className={blockClassName}>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Variants</p>
            <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1 text-xs text-white/75">
              {packet.variants.map((variant, index) => (
                <li key={`${index}-${variant.slice(0, 20)}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p>{variant}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="studioGhost"
                    onClick={() =>
                      onApplyPacket?.({
                        packet,
                        providerTarget,
                        outputType,
                        promptOverride: variant,
                      })
                    }
                    className="mt-2 h-7 rounded-full px-3 text-[11px]"
                  >
                    Use This Variant
                  </Button>
                </li>
              ))}
            </ul>
          </div>

          {packet.suggestions.length > 0 ? (
            <div className={blockClassName}>
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Director Notes</p>
              <ul className="mt-2 space-y-1.5 text-xs text-white/75">
                {packet.suggestions.map((item, index) => (
                  <li key={`${index}-${item.slice(0, 20)}`}>• {item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Recent Directs</p>
          {historyLoading ? <span className="text-[10px] text-white/45">Loading...</span> : null}
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-xs text-white/50">No saved directs yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {history.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2 text-xs text-white/75"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate pr-2">{item.user_intent}</span>
                  <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] text-cyan-200">
                    {item.production_readiness}%
                  </span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="studioGhost"
                    className="h-7 rounded-full px-3 text-[11px]"
                    onClick={() => {
                      setIntent(item.user_intent);
                      setPacket(item.packet);
                    }}
                  >
                    Open
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="studioSecondary"
                    className="h-7 rounded-full px-3 text-[11px]"
                    onClick={() =>
                      onApplyPacket?.({
                        packet: item.packet,
                        providerTarget,
                        outputType,
                      })
                    }
                  >
                    Apply
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ReadinessGauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 18;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="relative h-14 w-14">
      <svg className="h-14 w-14 -rotate-90" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="18" stroke="rgba(255,255,255,0.16)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r="18"
          stroke="rgba(103,232,249,0.95)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-semibold text-cyan-200">
        {clamped}%
      </span>
    </div>
  );
}
