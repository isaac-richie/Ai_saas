/**
 * Returns a safe same-origin path for post-auth redirects.
 *
 * Only accepts absolute paths beginning with a single "/" (e.g. "/dashboard").
 * Rejects protocol-relative ("//evil.com"), backslash tricks ("/\\evil.com"),
 * and absolute URLs ("https://evil.com") that could be used for open redirects.
 */
export function sanitizeNextPath(
    next: string | null | undefined,
    fallback: string = "/dashboard"
): string {
    if (typeof next !== "string") return fallback;

    const value = next.trim();
    // Must be a rooted path, but not protocol-relative or backslash-escaped.
    if (!value.startsWith("/")) return fallback;
    if (value.startsWith("//") || value.startsWith("/\\")) return fallback;

    return value;
}
