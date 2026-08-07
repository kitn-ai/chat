import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // No special config is required to consume @kitn.ai/ui in a STANDALONE app:
  // - It ships pre-compiled ESM in `dist/`, so `transpilePackages` is NOT needed.
  // - The register-all entry (`@kitn.ai/ui/elements`) is SSR-safe — it touches
  //   no `window`/`customElements` at import time, so importing it never throws
  //   during server rendering; it only registers in the browser.
  //
  // `outputFileTracingRoot` is only here because this example is NESTED inside
  // the library's monorepo: it pins the workspace root so Next doesn't walk up
  // and inherit the repo root's lockfile / Tailwind PostCSS config. A standalone
  // app does not need this (nor the local postcss.config.mjs).
  outputFileTracingRoot: __dirname,
  reactStrictMode: true,
};

export default nextConfig;
