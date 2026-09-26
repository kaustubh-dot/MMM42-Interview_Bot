/** @type {import('next').NextConfig} */
const nextConfig = {
  // "/" is the interview app's home page (src/app/(pipeline)/page.tsx). The legacy FoloUp
  // dashboard is still available at /dashboard.
  webpack: (webpackConfig, { webpack }) => {
    webpackConfig.plugins.push(
      // Remove node: from import specifiers, because Next.js does not yet support node: scheme
      // https://github.com/vercel/next.js/issues/28774
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
        resource.request = resource.request.replace(/^node:/, "");
      }),
    );

    return webpackConfig;
  },
};

module.exports = nextConfig;
