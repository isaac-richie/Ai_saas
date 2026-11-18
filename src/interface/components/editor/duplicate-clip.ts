import { toast } from 'sonner';
import { useTimelineStore } from '@/interface/hooks/use-timeline-store';

/** Duplicates a video or audio clip and says plainly why when it can't. Undo removes the copy. */
export function duplicateClipWithFeedback(id: string) {
  const result = useTimelineStore.getState().duplicate(id);
  if (result === 'track-locked') toast.error('This row is locked. Unlock it to duplicate a clip.');
  else if (result === 'clip-locked') toast.error("Can't duplicate here", { description: 'A locked clip after this one would have to move. Unlock it first, then try again.' });
  return result === 'ok';
}
