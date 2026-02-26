import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Health check endpoint for load balancers and monitoring.
 * Returns 200 if the server is running.
 * No authentication required — used by Nginx, AWS ALB, etc.
 *
 * SECURITY: process.uptime() intentionally omitted to prevent
 * information disclosure (server restart timing).
 */
export async function GET(request: Request) {
  // Rate limit: 60 health checks per minute per IP
  const ip = getClientIp(request)
  const rl = checkRateLimit(`health:${ip}`, 60, 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.resetAt)

  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
