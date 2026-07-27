/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Canvas embeds this tool inside an iframe. Do NOT set X-Frame-Options DENY.
  // Frame-ancestors are controlled per-response where needed.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
