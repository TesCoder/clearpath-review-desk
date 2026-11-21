import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind is applied to CSS by its Turbopack loader.
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
