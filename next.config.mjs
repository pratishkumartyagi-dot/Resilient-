/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  compress: true,
  poweredByHeader: false,
  output: 'standalone',
  serverExternalPackages: ['sharp', 'docx'],
};

export default nextConfig;
