'use client';

import { useState } from 'react';
import { AdjustDirection, type AdjustRequest } from '@/interface/components/fast-video/AdjustDirection';

const SHOTS = ['Opening', "Sam's Morning", 'Coffee', 'The window', 'Out the door'];

/** Sample film for the re-plan panel: pick the shot "in view", open a card's Re-plan, and see what would be sent. */
export function DevReplan() {
  const [focus, setFocus] = useState(2);
  const [openAt, setOpenAt] = useState<{ shot: number; nonce: number } | null>(null);
  const [hasWork, setHasWork] = useState(true);
  const [sent, setSent] = useState<AdjustRequest | null>(null);
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-white">
      <h1 className="text-lg">Re-plan preview</h1>
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
        <span>Shot in view:</span>
        {SHOTS.map((title, index) => (
          <button key={title} type="button" aria-pressed={focus === index + 1} onClick={() => setFocus(index + 1)} className={`rounded-full border px-2.5 py-1 ${focus === index + 1 ? 'border-gold-300/60 text-gold-50' : 'border-white/15'}`}>{index + 1}</button>
        ))}
        <button type="button" onClick={() => setOpenAt({ shot: 4, nonce: Date.now() })} className="rounded-full border border-white/15 px-2.5 py-1">Re-plan this shot (card 4)</button>
        <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={hasWork} onChange={(e) => setHasWork(e.target.checked)} /> Film has Takes</label>
      </div>
      <AdjustDirection shots={SHOTS} focusShot={focus} openAt={openAt} hasWork={hasWork} onSubmit={async (request) => setSent(request)} />
      <pre data-testid="sent" className="whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-white/70">{sent ? JSON.stringify(sent) : 'Nothing sent yet'}</pre>
    </main>
  );
}
