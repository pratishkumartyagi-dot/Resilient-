import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
