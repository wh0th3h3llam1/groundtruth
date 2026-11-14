import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production builds go to their own folder so `next dev` and `next start` can run side by side.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
