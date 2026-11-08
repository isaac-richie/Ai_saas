'use client';

import { useCallback, useState } from 'react';
import { FilmAudioDialog, LockedMediaEditor, LockedMediaRow, shotAudioSummary } from '@/interface/components/fast-video/LockedMedia';
import { DEFAULT_AUDIO_ACTIONS, type AudioActions } from '@/interface/components/fast-video/LockedAudio';
import { ProductionReferences } from '@/interface/components/fast-video/ProductionReferences';
import type { FilmLockView, ShotLockStatus } from '@/core/actions/long-form-locks';
import type { LockBinding } from '@/core/services/long-form-locks';
import { DIALOGUE_VOICES, defaultPlacement, planFilmAudio, plannedSpans, type AudioAsset, type AudioBinding } from '@/core/services/long-form-audio';
import type { ProductionAsset } from '@/core/validation/production-assets';

const pics = ['studio-plate-1.jpg', 'studio-plate-2.jpg', 'studio-plate-3.jpg', 'studio-plate-4.jpg', 'studio-plate-5.jpg', 'director.png', 'image1.jpeg', 'image2.jpeg', 'jpeg1.jpeg', 'jpeg2.jpeg', 'jpeg3.jpeg', 'jpeg4.jpeg'];
const names = ['Sam front', 'Sam profile', 'Marcia', 'Leon', 'Kitchen wide', 'Kitchen detail', 'Sam indoor wardrobe', 'Bible', 'Bedroom', 'Street', 'Car', 'Mug'];
const roles: ProductionAsset['role'][] = ['character', 'character', 'character', 'character', 'location', 'location', 'wardrobe', 'product', 'location', 'location', 'product', 'product'];
const library: ProductionAsset[] = pics.map((p, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name: names[i], url: `/${p}`, role: roles[i], mediaType: 'image', label: `@image${i + 1}` }));
const bind = (i: number, role: LockBinding['role'], entity: string, view = '', scope: 'scene' | 'shot' = 'shot'): LockBinding => ({
  scopeType: scope, shotNumber: scope === 'scene' ? null : 2, assetId: library[i].id, assetUrl: library[i].url, sha256: String(i).repeat(64).slice(0, 64),
  assetName: library[i].name, contentType: 'image/jpeg', byteSize: 500000, width: 1600, height: 1200, role, entityLabel: entity, viewLabel: view, anchorTitle: scope === 'shot' ? 'Kitchen group' : '',
});
const titles = ['Morning light', 'Kitchen group', 'Street exit'];
const seconds = [7, 10, 8];

/** A short tone as a playable WAV, so previews work without real files. */
function tone(sec: number, hz: number) {
  const rate = 8000, n = Math.round(sec * rate), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin((2 * Math.PI * hz * i) / rate) * 6000, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const sha = (c: string) => c.repeat(64).slice(0, 64);
const asset = (id: string, name: string, purpose: AudioAsset['purpose'], ms: number, origin: AudioAsset['origin'] = 'uploaded'): AudioAsset => ({
  id, origin, purpose, name, status: 'ready', storagePath: `dev/${id}`, playbackPath: `dev/${id}`, sha256: sha(id[0]), mimeType: 'audio/wav', byteSize: 1000,
  durationMs: ms, generation: null, providerTaskId: null, errorMessage: null, createdAt: new Date(0).toISOString(),
});

export function DevLocks() {
  const [paths] = useState(() => (typeof window === 'undefined' ? {} : { prayer: tone(9, 330), rain: tone(12, 180), music: tone(30, 440) }) as Record<string, string>);
  const fix = useCallback((a: AudioAsset) => ({ ...a, playbackPath: paths[a.id.split('-')[0]] ?? a.playbackPath }), [paths]);
  const [assets, setAssets] = useState<AudioAsset[]>(() => [
    asset('prayer-0000-4000-8000-000000000001', "Sam's prayer", 'dialogue', 9000, 'ai_generated'),
    asset('rain-0000-4000-8000-000000000002', 'Rain on window', 'ambience', 12000),
  ]);
  const [bindings, setBindings] = useState<AudioBinding[]>(() => [
    { id: 'b1', scopeType: 'shot', shotNumber: 1, audioAssetId: 'prayer-0000-4000-8000-000000000001', sha256: sha('p'), purpose: 'dialogue', anchorTitle: 'Morning light', ...defaultPlacement('dialogue', 'shot') },
    { id: 'b2', scopeType: 'scene', shotNumber: null, audioAssetId: 'rain-0000-4000-8000-000000000002', sha256: sha('r'), purpose: 'ambience', anchorTitle: '', ...defaultPlacement('ambience', 'scene') },
  ]);
  const [revision, setRevision] = useState(3);
  const [open, setOpen] = useState<number | null>(null);
  const [scope, setScope] = useState<'shot' | 'scene'>('shot');
  const [audioTab, setAudioTab] = useState<null | 'library' | 'upload' | 'ai'>(null);
  const [saved, setSaved] = useState<string>('');

  const readyAssets = assets.map(fix);
  const issues = planFilmAudio(bindings, new Map(readyAssets.map((a) => [a.id, a])), plannedSpans(titles.map((title, i) => ({ title, durationSec: seconds[i] }))), {
    currentTitles: new Map(titles.map((t, i) => [i + 1, t])),
  }).issues;
  const view: FilmLockView = {
    enabled: true, available: true, rootId: 'dev', revision, library, safetyLimit: 40, shotTitles: titles, shotSeconds: seconds,
    scene: [bind(0, 'character', 'Sam', 'front', 'scene'), bind(1, 'character', 'Sam', 'profile', 'scene'), bind(2, 'character', 'Marcia', '', 'scene'), bind(3, 'character', 'Leon', '', 'scene')],
    shots: { 2: [bind(4, 'location', 'Kitchen', 'wide'), bind(5, 'location', 'Kitchen', 'detail'), bind(6, 'wardrobe', 'Sam', 'indoor'), bind(6, 'prop', 'Sam')] },
    audio: { enabled: true, aiEnabled: true, available: true, assets: readyAssets, bindings, voices: DIALOGUE_VOICES.map((v) => ({ ...v })), issues },
  };
  const statuses: Record<number, ShotLockStatus> = {
    1: { shotNumber: 1, requiredImageCount: 4, bindingCount: 4, status: 'mapped', issues: [], model: 'bytedance/seedance-2-5', lockKeys: [] },
    2: { shotNumber: 2, requiredImageCount: 7, bindingCount: 8, status: 'blocked', issues: ['5 locked subjects need 5 reference elements; Kling 3.0 Pro accepts 3. Remove subjects or switch to Seedance 2.5.'], model: 'kling-3.0/video', lockKeys: [] },
  };

  const bump = () => { setRevision((r) => r + 1); return { data: { revision: revision + 1 } }; };
  const log = (name: string, input: unknown) => setSaved(`${name} ${JSON.stringify(input)}`);
  const actions: AudioActions = {
    ...DEFAULT_AUDIO_ACTIONS,
    uploadAudioFile: async (file) => { log('upload', { name: file.name, size: file.size }); return 'dev/upload'; },
    registerUploadedAudio: async (input) => {
      const i = input as { name: string; purpose: AudioAsset['purpose'] };
      const a = { ...asset(`music-${crypto.randomUUID().slice(5)}`, i.name, i.purpose, 30000), playbackPath: paths.music };
      setAssets((list) => [...list, a]); log('register', input); return { data: a };
    },
    createAiAudio: async (input) => {
      const i = input as { text: string; purpose: AudioAsset['purpose']; voiceId?: string };
      log('create', input);
      if (i.voiceId && !DIALOGUE_VOICES.some((v) => v.id === i.voiceId)) return { error: 'Choose one of the listed voices.' };
      const a: AudioAsset = { ...asset(`gen-${crypto.randomUUID().slice(4)}`, i.text.slice(0, 40), i.purpose, 1), status: 'generating', durationMs: null, storagePath: null, playbackPath: null, sha256: null, origin: 'ai_generated' };
      setAssets((list) => [...list, a]); return { data: a };
    },
    refreshAiAudio: async (input) => {
      const id = (input as { assetId: string }).assetId;
      const ready = { ...asset(id, 'AI take', 'dialogue', 6000, 'ai_generated'), playbackPath: paths.prayer };
      let out = ready;
      setAssets((list) => list.map((a) => (a.id === id ? (out = { ...ready, name: a.name, purpose: a.purpose }) : a)));
      return { data: [out] };
    },
    discardAudio: async (input) => { const id = (input as { assetId: string }).assetId; setAssets((l) => l.filter((a) => a.id !== id)); log('discard', input); return { data: { id } }; },
    lockAudio: async (input) => {
      const i = input as { assetId: string; scope: 'scene' | 'shot'; shotNumber: number | null; placement: Partial<AudioBinding> };
      const a = assets.find((x) => x.id === i.assetId)!;
      setBindings((list) => [...list, { id: crypto.randomUUID(), scopeType: i.scope, shotNumber: i.shotNumber, audioAssetId: a.id, sha256: a.sha256!, purpose: a.purpose, anchorTitle: i.shotNumber ? titles[i.shotNumber - 1] : '', ...defaultPlacement(a.purpose, i.scope), ...i.placement } as AudioBinding]);
      log('lock', input); return bump();
    },
    updateAudioPlacement: async (input) => {
      const i = input as { bindingId: string; placement: Partial<AudioBinding> };
      setBindings((list) => list.map((b) => (b.id === i.bindingId ? { ...b, ...i.placement } : b)));
      log('update', input); return bump();
    },
    removeAudioPlacement: async (input) => {
      const i = input as { bindingId: string };
      setBindings((list) => list.filter((b) => b.id !== i.bindingId)); log('remove', input); return bump();
    },
  };

  return (
    <div className="h-dvh overflow-y-auto bg-obsidian-950 px-4 py-8 text-white md:px-10">
      <div className="mx-auto mb-4 max-w-5xl"><ProductionReferences assets={library.slice(0, 3)} onChange={async () => null} audio={{ count: assets.length, aiEnabled: true, onOpen: setAudioTab }} /></div>
      <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-3">
        {[1, 2, 3].map((shot) => (
          <section key={shot} className="min-w-0 rounded-lg bg-white/5 p-4">
            <h4 className="text-sm font-medium">{shot}. {titles[shot - 1]}</h4>
            <p className="mt-2 text-xs text-white/50">{shot === 2 ? 'kling' : 'seedance'} / {seconds[shot - 1]}s requested / 16:9</p>
            <details className="mt-3 text-xs text-white/60"><summary className="cursor-pointer">Shot prompt</summary><p className="mt-2">Prompt…</p></details>
            <details className="mt-3 text-xs text-white/60"><summary className="cursor-pointer">Editing notes</summary><p className="mt-2">Notes…</p></details>
            <LockedMediaRow scene={view.scene} shot={view.shots[shot] ?? []} status={statuses[shot]} audio={shotAudioSummary(view, shot)} onEdit={() => { setScope('shot'); setOpen(shot); }} />
          </section>
        ))}
      </div>
      {saved && <p className="mx-auto mt-4 max-w-5xl break-all text-xs text-[#8fd1b9]" data-testid="saved">{saved}</p>}
      {audioTab && <FilmAudioDialog productionId="00000000-0000-4000-8000-000000000000" view={view} initialTab={audioTab} audioActions={actions} onChanged={async () => {}} onClose={() => setAudioTab(null)} />}
      {open !== null && (
        <LockedMediaEditor
          key={`${open}-${revision}`}
          productionId="00000000-0000-4000-8000-000000000000" shotNumber={open} shotCount={3} shotTitle={titles[open - 1] ?? ''} view={view} status={statuses[open]}
          onClose={() => setOpen(null)} onSaved={async () => {}} audioActions={actions} initialScope={scope} onScopeChange={setScope}
          save={async (input) => { log('save-images', input); return { data: { revision: 4 } }; }}
        />
      )}
    </div>
  );
}
