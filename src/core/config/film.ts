/** Longer films: how many shots one production may plan and generate. */
export const MIN_FILM_SHOTS = 2
export const MAX_FILM_SHOTS = 24

/**
 * The shot editor writes a full provider prompt for every shot. It writes at most this many per
 * request, so a 24-shot film is two checkpointed requests that each fit the planning time budget.
 */
export const SHOT_EDITOR_BATCH = 12

/**
 * Characters in one shot's provider prompt. Kling accepts 2,500 and Seedance far more; 2,000 leaves
 * room for long multi-location shots while staying safely inside Kling's hard limit.
 */
export const MAX_SHOT_PROMPT_CHARS = 2000
