import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "mongoose"],
  webpack: (config, { isServer }) => {
    config.externals = [
      ...(config.externals || []),
      "better-sqlite3",
      "@tensorflow/tfjs-node",
    ];
    if (!isServer) {
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          path: false,
          crypto: false,
          encoding: false,
        },
      };
    }
    return config;
  },
};

export default nextConfig;
