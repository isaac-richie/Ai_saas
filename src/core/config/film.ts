/** Longer films: how many shots one production may plan and generate. */
export const MIN_FILM_SHOTS = 2
export const MAX_FILM_SHOTS = 24

/**
 * The shot editor writes a full provider prompt for every shot. It writes at most this many per
 * request, so a 24-shot film is two checkpointed requests that each fit the planning time budget.
 */
export const SHOT_EDITOR_BATCH = 12
