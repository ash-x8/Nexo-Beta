/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  experimental: { serverComponentsExternalPackages: ["firebase-admin"] },
  headers: async () => [
    {
      source: "/sw.js",
      headers: [
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" }
      ]
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Microphone is only usable from this origin, and only after a user click.
        { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" }
      ]
    }
  ]
};
export default nextConfig;
