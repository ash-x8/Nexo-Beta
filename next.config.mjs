/** @type {import('next').NextConfig} */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.google.com",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com https://generativelanguage.googleapis.com https://api.tavily.com",
  "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self' https://aistudio.google.com https://*.googleusercontent.com"
].join("; ");

const nextConfig = {
  output: "standalone",
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
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        // allow-popups keeps the Google sign-in popup working
        { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        // Microphone is only usable from this origin, and only after a user click.
        { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" }
      ]
    }
  ]
};
export default nextConfig;
