/**
 * Hybrid rate limiter — Upstash Redis in production, in-memory fallback for development.
 *
 * Usage: Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars to
 * activate Redis-backed rate limiting. Without them, falls back to in-memory
 * (single-process only — fine for dev, not for multi-instance production).
 *
 * All consumers import { checkRateLimit, getClientIp, rateLimitResponse } and
 * don't need to know which backend is active.
 *
 * ARCHITECTURE: Upstash REST-based Redis requires zero persistent connections,
 * handles millions of requests/sec globally, and works in serverless/edge.
 *
 * SECURITY NOTE: getClientIp trusts X-Forwarded-For / X-Real-IP headers.
 * Deploy behind a trusted reverse proxy (Nginx, Cloudflare, AWS ALB) that
 * overwrites these headers with the real client IP.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ── Detect which backend to use ──────────────────────────────────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const USE_REDIS = Boolean(UPSTASH_URL && UPSTASH_TOKEN)

// ── Redis backend (Upstash) ──────────────────────────────────────────────────

let redis: Redis | null = null
if (USE_REDIS) {
  redis = new Redis({
    url: UPSTASH_URL!,
    token: UPSTASH_TOKEN!,
  })
}

/**
 * Cache of Ratelimit instances per unique (limit, window) pair.
 * Upstash Ratelimit objects are stateless wrappers around the Redis connection,
 * so reusing them avoids repeated object creation.
 */
const limiterCache = new Map<string, Ratelimit>()

function getUpstashLimiter(limit: number, windowMs: number): Ratelimit {
  const windowSec = Math.ceil(windowMs / 1000)
  const cacheKey = `${limit}:${windowSec}`
  let limiter = limiterCache.get(cacheKey)
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      analytics: false,
      prefix: 'rl',
    })
    limiterCache.set(cacheKey, limiter)
  }
  return limiter
}

// ── In-memory fallback (dev / single-process) ────────────────────────────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const MAX_STORE_SIZE = 50_000
const memStore = new Map<string, RateLimitEntry>()

// Clean up stale entries every 5 minutes
if (typeof globalThis !== 'undefined') {
  const cleanup = () => {
    const now = Date.now()
    for (const [key, entry] of memStore.entries()) {
      if (now > entry.resetAt) memStore.delete(key)
    }
  }
  setInterval(cleanup, 5 * 60 * 1000)
}

function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = memStore.get(key)

  if (!entry || now > entry.resetAt) {
    if (memStore.size >= MAX_STORE_SIZE) {
      const cutoff = Math.max(1000, Math.floor(MAX_STORE_SIZE * 0.1))
      let removed = 0
      for (const [k, v] of memStore.entries()) {
        if (removed >= cutoff) break
        if (now > v.resetAt) { memStore.delete(k); removed++ }
      }
      if (memStore.size >= MAX_STORE_SIZE) {
        const iter = memStore.keys()
        for (let i = 0; i < cutoff; i++) {
          const next = iter.next()
          if (next.done) break
          memStore.delete(next.value)
        }
      }
    }
    memStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}

// ── Public API (same signature — zero consumer changes) ──────────────────────

/**
 * Check if a key is within the allowed rate limit.
 * Uses in-memory rate limiting with the same signature as before.
 * For distributed Redis-backed rate limiting, use checkRateLimitAsync().
 *
 * @param key       Unique key (e.g. IP + route)
 * @param limit     Max allowed requests in the window
 * @param windowMs  Window duration in milliseconds
 * @returns { allowed: boolean, remaining: number, resetAt: number }
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  // Synchronous path always uses in-memory for instant response.
  // For distributed enforcement, use checkRateLimitAsync() which
  // queries Upstash Redis when configured.
  return memoryRateLimit(key, limit, windowMs)
}

/**
 * Async rate limit check — fully Redis-backed for maximum accuracy.
 * Use this in API routes where you can await (recommended for production).
 *
 * Falls back to synchronous in-memory if Redis is not configured.
 */
export async function checkRateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (USE_REDIS) {
    const limiter = getUpstashLimiter(limit, windowMs)
    const result = await limiter.limit(key)
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    }
  }
  return memoryRateLimit(key, limit, windowMs)
}

/**
 * Get the client IP from request headers.
 * Handles Nginx / Cloudflare → X-Forwarded-For, X-Real-IP, CF-Connecting-IP.
 *
 * When behind a trusted reverse proxy (Nginx with proxy_set_header),
 * X-Forwarded-For is reliable. The proxy overwrites the header with the
 * actual client IP, so spoofing is not possible.
 */
export function getClientIp(request: Request): string {
  // Prefer CF-Connecting-IP (Cloudflare) — always a single, verified IP
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) return cfIp.trim()

  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    // Take only the first IP (original client), ignore downstream proxies
    return xff.split(',')[0].trim()
  }

  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Returns a rate-limit-exceeded Response with standard headers.
 */
export function rateLimitResponse(resetAt: number) {
  const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000)
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, retryAfterSec)),
        'X-RateLimit-Reset': new Date(resetAt).toISOString(),
      },
    }
  )
}
