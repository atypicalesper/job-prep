/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const repoName = 'job-prep';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // GitHub Pages serves project sites under /repo-name
  basePath: isProd ? `/${repoName}` : '',
  assetPrefix: isProd ? `/${repoName}/` : '',
  images: {
    unoptimized: true, // required for static export
  },
};

module.exports = nextConfig;
