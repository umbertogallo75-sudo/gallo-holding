import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The runtime migration endpoint reads the SQL files from disk.
  outputFileTracingIncludes: {
    "/api/cron/migrate": ["./db/migrations/**"],
  },
  // The gym was called "Giochi" for a day. Anyone who saved that link, or has
  // an app screen still holding it, lands in the right place.
  async redirects() {
    return [
      { source: "/giochi", destination: "/palestra", permanent: true },
      { source: "/giochi/:slug", destination: "/palestra/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
