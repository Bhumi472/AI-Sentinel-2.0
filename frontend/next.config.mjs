/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    unoptimized: true,
  },

  // Remove turbo and optimizeFonts options for Next.js 16
  swcMinify: true,

  eslint: {
    ignoreDuringBuilds: true,
  },

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "https://sentinel-ai-backend-2o29.onrender.com/:path*",
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "font-src 'self' https://fonts.gstatic.com data:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
