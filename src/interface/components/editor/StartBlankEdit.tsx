'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';
import { startBlankEdit } from '@/core/actions/editor-hub';

/** Starts an empty edit and opens it, where the creator adds videos from their own device. */
export function StartBlankEdit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    const result = await startBlankEdit();
    if (!result.projectId) {
      setBusy(false);
      toast.error("Couldn't start a new edit", { description: result.error });
      return;
    }
    router.push(`/dashboard/editor?project=${result.projectId}`);
  };
  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="lux-glass group flex w-full items-center gap-3.5 rounded-3xl p-4 text-left transition-colors hover:border-gold-300/40 disabled:opacity-60"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#f3e5c0,#d9c08a_55%,#b8975a)] text-[#1a160e]">
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-white">Edit my own videos</span>
        <span className="block text-[13px] text-[#b0b8c4]">Start a new edit with clips from your phone or computer (MP4, MOV or WebM).</span>
      </span>
    </button>
  );
}
