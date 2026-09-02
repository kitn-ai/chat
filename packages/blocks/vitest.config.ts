import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node, not jsdom: this package is pure functions over injected data plus a
    // test suite that scans the authored block directories off disk. Nothing
    // here touches a DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
});
