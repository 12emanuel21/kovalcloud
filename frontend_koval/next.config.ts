import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://koval_backend:4000";

const nextConfig: NextConfig = {
  // Solo modo dev: Next bloquea por defecto peticiones de orígenes distintos de localhost.
  // Permitimos los subdominios de restaurante y el túnel temporal de Cloudflare.
  allowedDevOrigins: ['*.localhost', '*.trycloudflare.com'],
  async rewrites() {
    return [
      // Permite usar /api también al acceder directo por :3030 (sin Nginx)
      { source: "/api/:path*", destination: `${BACKEND_URL}/:path*` },
    ];
  },
};

export default nextConfig;
