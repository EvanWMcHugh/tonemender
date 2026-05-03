/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    outputFileTracingIncludes: {
      "/api/billing/apple/sync": ["./certs/**/*"],
    },
  },
};

module.exports = nextConfig;