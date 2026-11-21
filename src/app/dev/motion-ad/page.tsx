import { notFound } from 'next/navigation';
import { DevMotionAd } from './DevMotionAd';

export const metadata = { title: 'Motion ad preview' };

/** Local-only preview of Make a motion ad with sample data and no AI or renders; never served in production. */
export default function DevMotionAdPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <DevMotionAd />;
}
