/**
 * Kie's schemas for Kling 3.0, Seedance 2.x, Nano Banana, GPT Image and the lip-sync avatar have no
 * negative-prompt field, so a separate list of things to avoid never reaches those models. For them
 * the most important exclusions are written into the prompt itself as one short closing sentence.
 */

/** Characters kept free at the end of the prompt for the avoid sentence. */
export const AVOID_RESERVE = 220;

const NO_NEGATIVE_FIELD = /kling-3\.0|seedance|nano-banana|gpt-image|ai-avatar/i;

/** Whether the model accepts a separate negative prompt on Kie. Unknown models are assumed to. */
export function supportsNegativePrompt(model: string | null | undefined): boolean {
  return !NO_NEGATIVE_FIELD.test(model ?? '');
}

/**
 * "Avoid: a, b, c." from an ordered list of exclusions (most important first): trimmed, de-duplicated
 * and cut at a whole item so the sentence stays within `limit` characters. Empty when nothing fits.
 */
export function buildAvoidClause(items: string[], limit = AVOID_RESERVE): string {
  const seen = new Set<string>();
  const kept: string[] = [];
  const prefix = 'Avoid: ';
  let length = prefix.length + 1;
  for (const raw of items) {
    const item = raw.replace(/\s+/g, ' ').replace(/^[\s,.;]+|[\s,.;]+$/g, '');
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    const added = (kept.length ? 2 : 0) + item.length;
    if (length + added > limit) continue;
    seen.add(key);
    kept.push(item);
    length += added;
  }
  return kept.length ? `${prefix}${kept.join(', ')}.` : '';
}
