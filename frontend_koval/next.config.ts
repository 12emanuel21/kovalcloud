import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://koval_backend:4000";

const nextConfig: NextConfig = {
  /* config options here */
  async rewrites() {
    return [
      // Permite usar /api también al acceder directo por :3030 (sin Nginx)
      { source: "/api/:path*", destination: `${BACKEND_URL}/:path*` },
    ];
  },
};

export default nextConfig;
