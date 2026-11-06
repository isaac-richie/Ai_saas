'use client';

import { useState } from 'react';
import { LIGHTING_GROUPS, LIGHTING_PRESETS } from '@/core/config/lighting-presets';
import { LightingPhoto, LightingPicker } from '@/interface/components/fast-video/lighting-visuals';
import { ProductionShotSettings, emptyShotSettings, type ShotSettingDraft } from '@/interface/components/fast-video/ProductionShotSettings';

export function DevLighting() {
  const [quick, setQuick] = useState('light_rembrandt');
  const [film, setFilm] = useState<ShotSettingDraft[]>(emptyShotSettings);
  return (
    <div className="h-dvh overflow-y-auto bg-obsidian-950 px-4 py-8 text-white md:px-10">
      <div className="mx-auto max-w-5xl space-y-12">
        <section className="max-w-xl space-y-3">
          <h1 className="text-2xl font-light">Create · Shot look</h1>
          <LightingPicker value={quick} onChange={setQuick} />
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-light">Longer film · Sequence</h2>
          <ProductionShotSettings value={film} onChange={setFilm} disabled={false} />
        </section>

        <section className="space-y-6">
          <h2 className="text-2xl font-light">All {LIGHTING_PRESETS.length} setups</h2>
          {LIGHTING_GROUPS.map((group) => (
            <div key={group.id} className="space-y-3">
              <h3 className="text-sm uppercase tracking-[0.16em] text-gold-200">{group.label} <span className="normal-case tracking-normal text-[#8f97a1]">· {group.hint}</span></h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {LIGHTING_PRESETS.filter((p) => p.group === group.id).map((p) => (
                  <div key={p.id} className="lt-card overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
                    <LightingPhoto id={p.id} className="aspect-[4/5] w-full" />
                    <div className="space-y-1 p-3">
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-gold-200/80">{p.mood}</p>
                      <p className="text-xs leading-snug text-[#9aa1ab]">{p.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
