/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production'

const nextConfig = {
    serverExternalPackages: ['xlsx'],
    async headers() {
        /** @type {Array<{key: string, value: string}>} */
        const securityHeaders = [
            // Enable DNS prefetching for faster resource resolution
            { key: 'X-DNS-Prefetch-Control', value: 'on' },

            // Block clickjacking via iframes
            { key: 'X-Frame-Options', value: 'DENY' },

            // Prevent MIME-type sniffing
            { key: 'X-Content-Type-Options', value: 'nosniff' },

            // Control referrer information leakage
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

            // Camera allowed for same-origin (QR scanner); disable all other invasive APIs
            { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },

            // Cross-Origin isolation headers — prevent Spectre-class attacks
            // Use same-origin-allow-popups to allow OAuth/Supabase popups
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
            { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ]

        // HSTS — only in production behind real HTTPS; on plain HTTP it causes
        // the browser to force-upgrade requests and cache the directive
        if (isProd) {
            securityHeaders.push({
                key: 'Strict-Transport-Security',
                value: 'max-age=63072000; includeSubDomains; preload',
            })
        }

        // Content Security Policy is now handled dynamically in middleware.ts
        // with per-request nonces for script-src (replacing 'unsafe-inline').
        // Only static security headers remain here.

        return [
            {
                source: '/(.*)',
                headers: securityHeaders,
            },
        ]
    },
}

module.exports = nextConfig
