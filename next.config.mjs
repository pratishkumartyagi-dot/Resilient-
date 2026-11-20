/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  compress: true,
  poweredByHeader: false,
  output: 'standalone',
  turbopack: {},
  webpack: (config, { isServer }) => {
    // Fix pptxgenjs import of `node:` protocol modules in client bundle
    // (webpack 5 doesn't support node: protocol URIs natively)
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'node:https': false,
        'node:fs': false,
        'node:storage': false,
      };
      // Also add fallback for good measure
      config.resolve.fallback = {
        ...config.resolve.fallback,
        https: false,
        fs: false,
        'node:https': false,
        'node:fs': false,
      };
    }
    return config;
  },
};

export default nextConfig;