import { redirect } from 'next/navigation';
import { EditorView } from '@/interface/components/editor/EditorView';
import { createClient } from '@/infrastructure/supabase/server';

export const metadata = { title: 'Edit video' };

export default async function EditorPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  // Without a project the editor's front door picks one.
  if (!project || !/^[0-9a-f-]{36}$/i.test(project)) redirect('/dashboard/edit');
  const supabase = await createClient();
  const { data } = await supabase.from('projects').select('name').eq('id', project).maybeSingle();
  return <EditorView key={project} projectId={project} title={data?.name ?? undefined} />;
}
