import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: [
    "http://192.168.0.115:3000",
    "http://192.168.0.115:3001",
    "http://localhost:3000",
    "http://localhost:3001",
    "https://abhi4848.in"
  ]
};

export default nextConfig;
