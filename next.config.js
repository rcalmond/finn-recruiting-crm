/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [],
  outputFileTracingIncludes: {
    '/api/prep-for-call/generate': [
      './fonts/**/*',
    ],
    '/api/**/*': [
      './fonts/**/*',
    ],
  },
}

module.exports = nextConfig
