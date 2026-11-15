import { notFound } from 'next/navigation';
import { DevMimic } from './DevMimic';

export const metadata = { title: 'Mimic preview' };

/** Mimic with sample takes and stand-in actions: no database, storage or provider. Never on production. */
export default function DevMimicPage() {
  // Local development and Vercel preview deployments only.
  const production = process.env.VERCEL_ENV ? process.env.VERCEL_ENV === 'production' : process.env.NODE_ENV === 'production';
  if (production) notFound();
  return <DevMimic />;
}
