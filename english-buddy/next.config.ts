import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The runtime migration endpoint reads the SQL files from disk.
  outputFileTracingIncludes: {
    "/api/cron/migrate": ["./db/migrations/**"],
  },
};

export default nextConfig;
