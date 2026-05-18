import type { MiddlewareHandler } from "hono";

type Bucket = { tokens: number; refillAt: number; touched: number };

const BUCKETS = new Map<string, Bucket>();
const MAX = 60;
const REFILL_PER_SEC = 1;
const IDLE_EVICT_MS = 5 * 60 * 1000;

function clientIp(c: Parameters<MiddlewareHandler>[0]): string {
  const fly = c.req.header("Fly-Client-IP");
  if (fly) return fly;
  const xff = c.req.header("X-Forwarded-For");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

function gc() {
  const now = Date.now();
  for (const [k, b] of BUCKETS.entries()) {
    if (now - b.touched > IDLE_EVICT_MS) BUCKETS.delete(k);
  }
}

setInterval(gc, 60 * 1000).unref?.();

export const apiRateLimit: MiddlewareHandler = async (c, next) => {
  const ip = clientIp(c);
  const now = Date.now();
  let b = BUCKETS.get(ip);
  if (!b) {
    b = { tokens: MAX, refillAt: now, touched: now };
    BUCKETS.set(ip, b);
  } else {
    const elapsed = (now - b.refillAt) / 1000;
    if (elapsed > 0) {
      b.tokens = Math.min(MAX, b.tokens + elapsed * REFILL_PER_SEC);
      b.refillAt = now;
    }
  }
  b.touched = now;
  if (b.tokens < 1) {
    const retrySec = Math.ceil((1 - b.tokens) / REFILL_PER_SEC);
    c.header("Retry-After", String(retrySec));
    return c.json({ error: "rate_limited", retry_after: retrySec }, 429);
  }
  b.tokens -= 1;
  await next();
};
