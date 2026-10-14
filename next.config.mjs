/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
