import { notFound } from 'next/navigation';
import { DevPost } from './DevPost';

export const metadata = { title: 'Prepare a post preview' };

/** Local-only preview of Prepare a post with a sample draft and no AI calls; never served in production. */
export default function DevPostPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevPost />;
}
