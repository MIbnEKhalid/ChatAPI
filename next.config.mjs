/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ["better-sqlite3", "pg", "mbkauthe", "mbkutils"],
  async rewrites() {
    return [
      {
        source: "/info/main",
        destination: "/",
      },
      {
        source: "/home",
        destination: "/chatbot",
      },
      {
        source: "/chat/:chatId",
        destination: "/chatbot/:chatId",
      },
      {
        source: "/dashboard",
        destination: "/admin/dashboard",
      },
    ];
  },
};

export default nextConfig;
