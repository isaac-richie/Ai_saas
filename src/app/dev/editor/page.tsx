import { notFound } from 'next/navigation';
import { DevEditor } from './DevEditor';

export const metadata = { title: 'Editor preview' };

/** Local-only preview of the editor UI with sample media; never served in production. */
export default function DevEditorPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevEditor />;
}
