import { notFound } from 'next/navigation';
import { DevLocks } from './DevLocks';

export const metadata = { title: 'Locked images preview' };

/** Local-only preview of Long Form locked images with sample data; never served in production. */
export default function DevLocksPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevLocks />;
}
