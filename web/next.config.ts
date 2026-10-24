import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the dev server be opened at 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
