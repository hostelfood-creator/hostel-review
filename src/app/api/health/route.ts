import { NextResponse } from 'next/server'

/**
 * Health check endpoint for load balancers and monitoring.
 * Returns 200 if the server is running, with basic status info.
 * No authentication required — used by Nginx, AWS ALB, etc.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  )
}
