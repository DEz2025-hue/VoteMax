import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo root is the repo root, not this app folder. On Vercel the app is
  // deployed standalone, so the default tracing root is correct there.
  ...(process.env.VERCEL ? {} : { outputFileTracingRoot: path.join(dirname, '..', '..') }),
  webpack: (config, { dev }) => {
    // The persistent webpack pack cache is memory-hungry and has caused
    // out-of-memory failures on low-memory machines. Disable it in dev.
    if (dev) config.cache = false;
    return config;
  },
};

export default nextConfig;
