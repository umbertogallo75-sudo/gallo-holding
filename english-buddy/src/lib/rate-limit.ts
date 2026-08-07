/**
 * Minimal in-memory fixed-window rate limiter. Per serverless instance, which
 * is acceptable protection for a single-user app: it stops brute-force bursts
 * and accidental client loops without external infrastructure.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()) {
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  entry.count++;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}

export function clientKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "local";
  return `${scope}:${ip}`;
}
