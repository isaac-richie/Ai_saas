import Link from 'next/link';
import { Clapperboard, Film, LayoutGrid, Scissors } from 'lucide-react';
import { listEditableWork, type EditableWork } from '@/core/actions/editor-hub';
import { WorkspaceHeading } from '@/interface/components/layout/WorkspaceHeading';
import { ErrorStatePanel } from '@/interface/components/ui/state-panels';
import { StartBlankEdit } from '@/interface/components/editor/StartBlankEdit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Edit' };

const KIND = {
  film: { label: 'Film', icon: Film },
  storyboard: { label: 'Storyboard', icon: LayoutGrid },
  edit: { label: 'Edit', icon: Scissors },
} as const;

/** The editor's front door: pick something you made, or start from your own videos. */
export default async function EditHubPage() {
  const result = await listEditableWork();
  const work = result.data || [];
  return (
    <div className="workspace-page space-y-8">
      <WorkspaceHeading
        label="EDIT"
        title="Cut it together."
        description="Open a film or storyboard you made, or start with videos from your phone or computer. AI can make the first cut for you."
      />

      <StartBlankEdit />

      {result.error ? (
        <ErrorStatePanel title="Could not load your work" description={result.error} />
      ) : work.length === 0 ? (
        <div className="lux-glass rounded-3xl p-6 text-center">
          <p className="text-[15px] text-white">Nothing to edit yet.</p>
          <p className="mt-1 text-sm text-[#b0b8c4]">Add videos from your device above, or make your first shots in Create.</p>
          <Link href="/dashboard/fast-video" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gold-400/50 px-4 py-2.5 text-sm text-gold-100 hover:bg-gold-500/10">
            <Clapperboard className="size-4" /> Go to Create
          </Link>
        </div>
      ) : (
        <section aria-label="Your work" className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-[#9aa3ad]">Your work</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {work.map((item) => <WorkCard key={item.projectId} item={item} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function WorkCard({ item }: { item: EditableWork }) {
  const kind = KIND[item.kind];
  const Icon = kind.icon;
  return (
    <li className="min-w-0">
      <Link href={`/dashboard/editor?project=${item.projectId}`} className="lux-glass group block overflow-hidden rounded-3xl transition-colors hover:border-gold-300/40">
        <div className="relative aspect-video bg-black/40">
          {item.previewUrl ? (
            <video src={`${item.previewUrl}#t=0.5`} muted playsInline preload="metadata" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-[#6f7782]"><Icon className="size-8" strokeWidth={1.4} /></div>
          )}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-gold-100 backdrop-blur">
            <Icon className="size-3.5" /> {kind.label}
          </span>
        </div>
        <div className="p-4">
          <p className="truncate text-[15px] font-medium text-white">{item.title}</p>
          <p className="mt-0.5 text-[13px] text-[#9aa3ad]">
            {item.clipCount ? `${item.clipCount} finished shot${item.clipCount === 1 ? '' : 's'} · ` : ''}Open in editor
          </p>
        </div>
      </Link>
    </li>
  );
}
