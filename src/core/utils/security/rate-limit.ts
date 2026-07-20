/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Suitable for single-instance / best-effort throttling of public endpoints.
 * For multi-instance deployments back this with a shared store (e.g. Redis).
 */
type Bucket = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};

export function checkRateLimit(
    key: string,
    { max, windowMs }: { max: number; windowMs: number }
): RateLimitResult {
    const now = Date.now();
    const current = buckets.get(key);

    if (!current || now >= current.resetAt) {
        const next: Bucket = { count: 1, resetAt: now + windowMs };
        buckets.set(key, next);
        return { allowed: true, remaining: max - 1, resetAt: next.resetAt };
    }

    if (current.count >= max) {
        return { allowed: false, remaining: 0, resetAt: current.resetAt };
    }

    current.count += 1;
    buckets.set(key, current);
    return { allowed: true, remaining: max - current.count, resetAt: current.resetAt };
}

/**
 * Best-effort client IP extraction from proxy headers.
 */
export function getClientIp(request: Request): string {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        const first = forwardedFor.split(",")[0]?.trim();
        if (first) return first;
    }
    return request.headers.get("x-real-ip")?.trim() || "unknown";
}
