type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const buckets = new Map<string, Bucket>();

export function checkStudioAdRateLimit(key: string): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    const next: Bucket = {
      count: 1,
      resetAt: now + WINDOW_MS,
    };
    buckets.set(key, next);
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, resetAt: next.resetAt };
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  buckets.set(key, current);
  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_WINDOW - current.count,
    resetAt: current.resetAt,
  };
}

