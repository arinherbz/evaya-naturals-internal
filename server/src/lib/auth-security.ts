import { randomBytes } from 'node:crypto';
import type { Context } from 'hono';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;

type RateLimitEntry = {
  attempts: number;
  resetAt: number;
};

export class MemoryRateLimiter {
  private readonly attempts = new Map<string, RateLimitEntry>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
  ) {}

  isBlocked(key: string) {
    const now = Date.now();
    const current = this.attempts.get(key);

    if (!current) {
      return false;
    }

    if (current.resetAt <= now) {
      this.attempts.delete(key);
      return false;
    }

    return current.attempts >= this.maxAttempts;
  }

  recordFailure(key: string) {
    const now = Date.now();
    const current = this.attempts.get(key);

    if (!current || current.resetAt <= now) {
      this.attempts.set(key, {
        attempts: 1,
        resetAt: now + this.windowMs,
      });
      return;
    }

    current.attempts += 1;
    this.attempts.set(key, current);
  }

  reset(key: string) {
    this.attempts.delete(key);
  }

  clear() {
    this.attempts.clear();
  }
}

export const loginRateLimiter = new MemoryRateLimiter(5, 15 * 60 * 1000);
export const passwordResetRateLimiter = new MemoryRateLimiter(10, 15 * 60 * 1000);

export function generateSessionToken() {
  return randomBytes(48).toString('hex');
}

export function parseBearerToken(headerValue?: string | null) {
  if (!headerValue) return null;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getRequestIp(c: Context) {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return c.req.header('x-real-ip')
    || c.req.header('cf-connecting-ip')
    || 'unknown';
}

export function getSessionExpiryIso(now = Date.now()) {
  return new Date(now + SESSION_TTL_MS).toISOString();
}

export function shouldRefreshSession(expiresAt: string, now = Date.now()) {
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) {
    return true;
  }

  return expiryMs - now <= SESSION_REFRESH_THRESHOLD_MS;
}
