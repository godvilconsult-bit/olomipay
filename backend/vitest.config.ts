import { defineConfig } from 'vitest/config';

// Fast unit loop — pure functions only, no database. Stays sub-second so it can
// run on every save. Integration tests live in src/test/integration and boot a
// real Postgres; run them with `npm run test:integration`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/test/integration/**', 'node_modules/**'],
  },
});
