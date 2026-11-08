'use client';

import { useState } from 'react';
import { LockedImagesEditor, LockedImagesRow } from '@/interface/components/fast-video/LockedImages';
import type { FilmLockView, ShotLockStatus } from '@/core/actions/long-form-locks';
import type { LockBinding } from '@/core/services/long-form-locks';
import type { ProductionAsset } from '@/core/validation/production-assets';

const pics = ['studio-plate-1.jpg', 'studio-plate-2.jpg', 'studio-plate-3.jpg', 'studio-plate-4.jpg', 'studio-plate-5.jpg', 'director.png', 'image1.jpeg', 'image2.jpeg', 'jpeg1.jpeg', 'jpeg2.jpeg', 'jpeg3.jpeg', 'jpeg4.jpeg'];
const names = ['Sam front', 'Sam profile', 'Marcia', 'Leon', 'Kitchen wide', 'Kitchen detail', 'Sam indoor wardrobe', 'Bible', 'Bedroom', 'Street', 'Car', 'Mug'];
const roles: ProductionAsset['role'][] = ['character', 'character', 'character', 'character', 'location', 'location', 'wardrobe', 'product', 'location', 'location', 'product', 'product'];
const library: ProductionAsset[] = pics.map((p, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name: names[i], url: `/${p}`, role: roles[i], mediaType: 'image', label: `@image${i + 1}` }));
const bind = (i: number, role: LockBinding['role'], entity: string, view = '', scope: 'scene' | 'shot' = 'shot'): LockBinding => ({
  scopeType: scope, shotNumber: scope === 'scene' ? null : 2, assetId: library[i].id, assetUrl: library[i].url, sha256: String(i).repeat(64).slice(0, 64),
  assetName: library[i].name, contentType: 'image/jpeg', byteSize: 500000, width: 1600, height: 1200, role, entityLabel: entity, viewLabel: view,
});
const view: FilmLockView = {
  enabled: true, available: true, rootId: 'dev', revision: 3, library, safetyLimit: 40,
  scene: [bind(0, 'character', 'Sam', 'front', 'scene'), bind(1, 'character', 'Sam', 'profile', 'scene'), bind(2, 'character', 'Marcia', '', 'scene'), bind(3, 'character', 'Leon', '', 'scene')],
  shots: { 2: [bind(4, 'location', 'Kitchen', 'wide'), bind(5, 'location', 'Kitchen', 'detail'), bind(6, 'wardrobe', 'Sam', 'indoor'), bind(6, 'prop', 'Sam')] },
};
const statuses: Record<number, ShotLockStatus> = {
  1: { shotNumber: 1, requiredImageCount: 4, bindingCount: 4, status: 'mapped', issues: [], model: 'bytedance/seedance-2-5' },
  2: { shotNumber: 2, requiredImageCount: 7, bindingCount: 8, status: 'blocked', issues: ['5 locked subjects need 5 reference elements; Kling 3.0 Pro accepts 3. Remove subjects or switch to Seedance 2.5.', 'Character Marcia has 1 image; Kling 3.0 Pro needs 2 to 4 images of the same subject for each reference.'], model: 'kling-3.0/video' },
};

export function DevLocks() {
  const [open, setOpen] = useState<number | null>(null);
  const [saved, setSaved] = useState<string>('');
  return (
    <div className="h-dvh overflow-y-auto bg-obsidian-950 px-4 py-8 text-white md:px-10">
      <div className="mx-auto grid max-w-5xl gap-3 lg:grid-cols-3">
        {[1, 2, 3].map((shot) => (
          <section key={shot} className="min-w-0 rounded-lg bg-white/5 p-4">
            <h4 className="text-sm font-medium">{shot}. {['Morning light', 'Kitchen group', 'Street exit'][shot - 1]}</h4>
            <p className="mt-2 text-xs text-white/50">{shot === 2 ? 'kling' : 'seedance'} / 10s requested / 16:9</p>
            <details className="mt-3 text-xs text-white/60"><summary className="cursor-pointer">Shot prompt</summary><p className="mt-2">Prompt…</p></details>
            <details className="mt-3 text-xs text-white/60"><summary className="cursor-pointer">Editing notes</summary><p className="mt-2">Notes…</p></details>
            <LockedImagesRow scene={shot === 3 ? [] : view.scene} shot={view.shots[shot] ?? []} status={shot === 3 ? undefined : statuses[shot]} onEdit={() => setOpen(shot)} />
          </section>
        ))}
      </div>
      {saved && <p className="mx-auto mt-4 max-w-5xl text-xs text-[#8fd1b9]" data-testid="saved">{saved}</p>}
      {open !== null && (
        <LockedImagesEditor
          productionId="00000000-0000-4000-8000-000000000000" shotNumber={open} shotCount={3} shotTitle={["Morning light", "Kitchen group", "Street exit"][open - 1] ?? ""} view={view} status={statuses[open]}
          onClose={() => setOpen(null)} onSaved={async () => {}}
          save={async (input) => { setSaved(JSON.stringify(input)); return { data: { revision: 4 } }; }}
        />
      )}
    </div>
  );
}
