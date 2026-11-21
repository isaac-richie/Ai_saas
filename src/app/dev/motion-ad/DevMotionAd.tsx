'use client';

import { MotionAdCard, type MotionAdActions } from '@/interface/components/fast-video/MotionAdCard';
import type { MotionAdView } from '@/core/actions/motion-ads';
import type { Plan } from '@/core/services/motion-ad/contract';
import { applyVoice, retime } from '@/core/services/motion-ad/timing';
import { FINAL_UNITS, planState, withImages } from '@/core/services/motion-ad/state';
import golden from '../../../../motion-ads/src/fixtures/golden-mist.json';

// Sample stills from the app's own library stand in for the user's uploads.
const STILLS = ['/studio-plate-1.jpg', '/studio-plate-3.jpg', '/studio-plate-5.jpg', '/studio-plate-4.jpg', '/studio-plate-2.jpg', '/jpeg2.jpeg'];
let ad: MotionAdView | null = null;
let polls = 0;
const base = (): MotionAdView => ({
  id: '00000000-0000-4000-8000-0000000000ad', state: 'draft', failedFrom: null, brief: '', lengthS: 15, aspect: '16:9', resolution: '1080p', plan: null,
  notice: null, rightsAcceptedAt: null, images: [], voice: null, logo: null, warnings: [], versions: [], job: null, finalUnits: FINAL_UNITS, updatedAt: new Date().toISOString(),
});
const save = (patch: Partial<MotionAdView>) => (ad = { ...(ad ?? base()), ...patch });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const actions: MotionAdActions = {
  create: async (i) => ({ data: save({ ...base(), ...(i as Partial<MotionAdView>) }) }),
  update: async (i) => ({ data: save(i as Partial<MotionAdView>) }),
  get: async () => {
    if (!ad) return { error: 'none' };
    if (ad.state === 'building' && ++polls > 1) save({ state: 'preview_ready', versions: [{ n: 1, previewUrl: '/landing-720.mp4', finalUrl: null, silentUrl: null, stemUrl: null, finalResolution: null, watermark: true }] });
    if (ad.state === 'final_rendering' && ++polls > 1) save({ state: 'done', versions: [{ ...ad.versions[0], finalUrl: '/landing-720.mp4', silentUrl: '/landing-720.mp4', stemUrl: '/sample.wav' }] });
    return { data: ad };
  },
  plan: async () => {
    await wait(900);
    const g = golden as Plan;
    const plan = withImages({ ...g, total_s: ad!.lengthS, shots: retime(g.shots, ad!.lengthS) }, ad!.images.map((i) => i.tag));
    return { data: save({ plan, state: planState(plan) }) };
  },
  register: async (i) => {
    const { kind, tag } = i as { kind: string; tag?: string };
    if (kind === 'voice') {
      const timed = applyVoice(ad!.plan!, 14.0, ad!.lengthS);
      return { data: save({ voice: { url: '/sample.wav', durationS: 14 }, plan: timed.plan, notice: timed.note }) };
    }
    if (kind === 'logo') return { data: save({ logo: { url: '/visiowave-logo.jpeg' } }) };
    const n = Number(tag!.replace('@image', ''));
    const images = [...ad!.images.filter((x) => x.tag !== tag), { tag: tag!, url: STILLS[(n - 1) % STILLS.length], width: 1920, height: 1536 }];
    const plan = withImages(ad!.plan!, images.map((x) => x.tag));
    const warnings = ad!.resolution === '4k' ? images.map((x) => ({ shot: Number(x.tag.slice(6)), tag: x.tag, message: 'Image too small for 4K', maxResolution: '1080p' })) : [];
    return { data: save({ images, plan, warnings, state: planState(plan) }) };
  },
  approve: async () => { polls = 0; return { data: save({ state: 'building', rightsAcceptedAt: new Date().toISOString(), job: { type: 'preview', state: 'running', attempt: 1, error: null } }) }; },
  final: async (i) => { polls = 0; return { data: save({ state: 'final_rendering', resolution: (i as { resolution: '1080p' | '4k' }).resolution }) }; },
  retry: async () => ({ data: ad! }),
  remove: async () => { ad = null; return { data: { deleted: true as const } }; },
  upload: async () => { await wait(300); return 'sample'; },
};

export function DevMotionAd() {
  return (
    <main className="mx-auto max-w-[34rem] space-y-4 p-6 text-white">
      <h1 className="text-lg">Motion ad preview</h1>
      <div className="rounded-2xl border border-line bg-white/[0.02] p-3"><MotionAdCard actions={actions} /></div>
    </main>
  );
}
