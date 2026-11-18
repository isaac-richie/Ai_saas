/**
 * Download links for finished exports. A browser ignores the HTML `download` attribute on a link to
 * another site (our storage), so the file itself has to be served as an attachment. These helpers
 * decide which stored file a link may point at and what it is saved as.
 */

const RENDERS_PREFIX = '/storage/v1/object/public/renders/';
/** `<user>/timeline/<project>/<timeline>/render-<time>.mp4`, or a phone version `render-<time>-9x16.mp4`. */
const RENDER_KEY = /^[0-9a-f-]{36}\/timeline\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/render-\d+(-\d{1,2}x\d{1,2})?\.mp4$/i;

/** The storage key behind a public export URL from our own storage, or null for anything else. */
export function renderKeyFromUrl(url: unknown, supabaseUrl: string | undefined): string | null {
  if (typeof url !== 'string' || !supabaseUrl) return null;
  try {
    const u = new URL(url);
    const own = new URL(supabaseUrl);
    if (u.protocol !== 'https:' && u.protocol !== own.protocol) return null;
    if (u.host !== own.host || u.username || u.password || !u.pathname.startsWith(RENDERS_PREFIX)) return null;
    const key = decodeURIComponent(u.pathname.slice(RENDERS_PREFIX.length));
    return RENDER_KEY.test(key) ? key : null;
  } catch {
    return null;
  }
}

/** Only the signed-in creator's own exports can be handed out. */
export function isOwnRenderKey(key: string, userId: string): boolean {
  return RENDER_KEY.test(key) && key.startsWith(`${userId}/`);
}

const ASPECT_NAME: Record<string, string> = { '9x16': 'vertical', '1x1': 'square', '4x5': 'portrait', '16x9': 'wide' };

/** A safe file name: the edit's title (letters, digits, spaces, dashes), a phone-version suffix, and .mp4. */
export function exportFileName(title: string | null | undefined, key: string): string {
  const base = (title || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 _-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim() || 'Visiowave video';
  const aspect = /-(\d{1,2}x\d{1,2})\.mp4$/i.exec(key)?.[1];
  const suffix = aspect ? ` (${ASPECT_NAME[aspect] || aspect})` : '';
  return `${base}${suffix}.mp4`;
}
