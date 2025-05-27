// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* existing config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        // You can optionally specify port and pathname if needed
        // port: '',
        // pathname: '/account123/**',
      },
      // Added configuration for i.imgur.com
      {
        protocol: 'https',
        hostname: 'i.imgur.com',
        // port: '', // Typically not needed for Imgur
        // pathname: '/**', // Allows any path on i.imgur.com, common for image hosts
      },
      // If you have other primary image domains, add their configurations here as well.
      // For example:
      // {
      //   protocol: 'https',
      //   hostname: 'your-other-image-domain.com',
      // },
    ],
  },
};

export default nextConfig;
