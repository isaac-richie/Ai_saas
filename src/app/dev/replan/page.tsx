import { notFound } from 'next/navigation';
import { DevReplan } from './DevReplan';

export const metadata = { title: 'Re-plan preview' };

/** Local-only preview of "Adjust production direction" (one shot or the whole film); never served in production. */
export default function DevReplanPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevReplan />;
}
