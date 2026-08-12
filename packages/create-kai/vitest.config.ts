import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The generate + kit-contract suites read from dist/templates and the kit's
    // built .d.ts, so they are ordinary node tests with real filesystem reads.
    // No mocking: a mocked template copy proves nothing about the copy.
    globals: false,
  },
});
