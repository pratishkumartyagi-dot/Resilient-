import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
