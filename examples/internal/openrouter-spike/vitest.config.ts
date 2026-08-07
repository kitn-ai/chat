import { defineConfig } from 'vitest/config';

// The adapter is framework-neutral, so its test needs no DOM and no browser —
// plain node, no API key, no network.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
});
