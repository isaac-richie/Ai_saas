import Link from 'next/link';
import { EditorView } from '@/interface/components/editor/EditorView';

export const metadata = { title: 'Edit video' };

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  if (!project || !/^[0-9a-f-]{36}$/i.test(project)) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-center">
        <div className="space-y-4">
          <p className="text-[15px] text-[#d6d0c0]">Open a storyboard first, then tap Edit video.</p>
          <Link href="/dashboard/fast-video" className="inline-flex rounded-xl border border-gold-400/50 px-4 py-2.5 text-sm text-gold-100 hover:bg-gold-500/10">
            Go to Create
          </Link>
        </div>
      </div>
    );
  }
  return <EditorView key={project} projectId={project} />;
}
