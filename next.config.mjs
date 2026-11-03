/** @type {import('next').NextConfig} */
const nextConfig = {
  // Excluded from the build — these are reference snapshots, not pages.
  pageExtensions: ['tsx', 'ts'],
  eslint: { ignoreDuringBuilds: true },
  // The teaching walkthrough is one static file in public/; this gives it a clean URL.
  async rewrites() {
    return [{ source: '/learn', destination: '/learn.html' }];
  },
};

export default nextConfig;
