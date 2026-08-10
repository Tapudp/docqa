import { copyFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Copy the pdf.js worker into public/ so it's served locally (no CDN dependency)
const workerSrc = resolve(__dirname, "node_modules/pdfjs-dist/build/pdf.worker.min.js");
const workerDest = resolve(__dirname, "public/pdf.worker.min.js");
mkdirSync(resolve(__dirname, "public"), { recursive: true });
copyFileSync(workerSrc, workerDest);

// Internal API URL used by the Next.js server to proxy /api/* requests.
// In K8s this is the ClusterIP service name. Override via INTERNAL_API_URL env var.
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? "http://api:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${INTERNAL_API_URL}/api/:path*`,
      },
    ];
  },
  webpack: (config) => {
    // pdfjs-dist optionally requires canvas; alias it to false to suppress the warning
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    return config;
  },
};

export default nextConfig;
