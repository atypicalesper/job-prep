/** @type {import('next').NextConfig} */
const repoName = 'dev-atlas';
// GITHUB_ACTIONS is set automatically by GitHub Actions runners.
// Use it (not NODE_ENV) to gate the basePath/assetPrefix so that
// `npm run build` locally still produces paths that work with `npx serve out`.
const isGitHubPages = process.env.GITHUB_ACTIONS === 'true';
const basePath = isGitHubPages ? `/${repoName}` : '';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  basePath,
  assetPrefix: isGitHubPages ? `/${repoName}/` : '',
  // Expose basePath to client/server components — unoptimized mode bypasses
  // the image loader that would otherwise prepend basePath automatically
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
