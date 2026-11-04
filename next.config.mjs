/** @type {import('next').NextConfig} */
const nextConfig = {
  // Excluded from the build — these are reference snapshots, not pages.
  pageExtensions: ['tsx', 'ts'],
  // A second dev server in this folder needs its own build folder (NEXT_DIST_DIR=.next-m7).
  // Two servers on one .next made the page reload mid-request in M4.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: { ignoreDuringBuilds: true },
  // Dev only: lets other devices on the home Wi-Fi load /_next assets (CSS, JS).
  allowedDevOrigins: ['192.168.254.*'],
  // The teaching walkthrough is one static file in public/; this gives it a clean URL.
  async rewrites() {
    return [{ source: '/learn', destination: '/learn.html' }];
  },
};

export default nextConfig;
