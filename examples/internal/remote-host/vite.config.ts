import { defineConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * Vite config for the remote-HOST dev example (the cross-origin counterpart to
 * examples/remote-provider/). Serves index.html at / and resolves the host SDK
 * imports straight from ../../../packages/ui/src (no prior build needed; Vite handles TS).
 *
 * Run via:  vite examples/remote-host --port 6006 --strictPort
 * (Playwright's first webServer entry; see
 * packages/ui/config/playwright/cross-origin.config.ts.)
 */
export default defineConfig({
  root: resolve(__dirname),
});
