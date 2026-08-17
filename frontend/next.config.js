/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  swcMinify: true,
  experimental: {
    forceSwcTransforms: true,
  },
  // The bare domain must land on the marketplace.
  //
  // app/page.tsx also calls redirect('/shop'), but as a statically prerendered
  // page that compiles to a 307 carrying an HTML body and NO Location header,
  // which leaves plain HTTP clients (curl, link previewers, some crawlers)
  // stuck. A config-level redirect emits a real Location, so every client
  // follows it. The page component stays as a same-origin fallback.
  async redirects() {
    return [{ source: '/', destination: '/shop', permanent: false }];
  },

  env: {
    NEXT_PUBLIC_API_URL:         process.env.NEXT_PUBLIC_API_URL         ?? 'http://localhost:3001',
    NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet',
    NEXT_PUBLIC_USDC_ISSUER:     process.env.NEXT_PUBLIC_USDC_ISSUER     ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
};

module.exports = nextConfig;
