/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: '/favicon.ico', destination: '/favicon.svg' },
      { source: '/favicon.png', destination: '/favicon.svg' },
    ];
  },
};

module.exports = nextConfig;
