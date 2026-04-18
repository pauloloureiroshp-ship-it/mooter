import { defineConfig } from 'vitest/config';

// Vitest baseline — runs any *.test.ts / *.test.tsx under app/.
// Intentionally minimal: no React testing library yet (add when we need to
// assert on rendered output). Current suite covers pure logic / schemas.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['app/**/*.test.ts', 'app/**/*.test.tsx'],
    globals: false,
  },
});
