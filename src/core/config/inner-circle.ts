/**
 * One-tap answers to "What's the #1 problem with AI video tools today?". The form offers them and the
 * admin page counts them, so both must use this exact list.
 */
export const INNER_CIRCLE_PROBLEMS = [
  'Characters change between shots',
  'Lip-sync looks off',
  'Clips are too short',
  'Hard to control the camera',
  'Too expensive',
] as const;

/** Chips and free text are saved as one answer joined with "; ". */
export const INNER_CIRCLE_ANSWER_SEPARATOR = '; ';
