/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const repoName = 'dev-atlas';
const basePath = isProd ? `/${repoName}` : '';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  assetPrefix: isProd ? `/${repoName}/` : '',
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
