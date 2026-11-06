import { notFound } from 'next/navigation';
import { DevLighting } from './DevLighting';

export const metadata = { title: 'Lighting preview' };

/** Local-only preview of the lighting library and pickers; never served in production. */
export default function DevLightingPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevLighting />;
}
