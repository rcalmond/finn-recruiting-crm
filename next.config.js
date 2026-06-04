/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [],
  outputFileTracingIncludes: {
    '/api/prep-for-call/generate': [
      './node_modules/pdfkit/js/data/**/*',
    ],
  },
}

module.exports = nextConfig
