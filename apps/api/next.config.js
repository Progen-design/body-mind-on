/** @type {import('next').NextConfig} */

// Bezpečnostní response headers pro všechny routy (P3 hardening).
// Záměrně bez plné CSP na skripty/styly — Next.js (pages router + styled-jsx)
// používá inline skripty/styly; CSP je omezená na frame-ancestors, což nic nerozbije.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
];

const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/favicon.svg' },
      { source: '/favicon.png', destination: '/favicon.svg' },
    ];
  },
};

module.exports = nextConfig;
