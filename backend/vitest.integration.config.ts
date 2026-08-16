import { defineConfig } from 'vitest/config';

// Integration suite — boots a real embedded Postgres (no Docker) and exercises
// the order lifecycle end to end. Slower, so it is kept out of `npm test`.
//
// singleFork: every test shares one database and mutates stock, so they must run
// serially. Parallel workers would race on the same inventory rows.
export default defineConfig({
  test: {
    include:     ['src/test/integration/**/*.test.ts'],
    globalSetup: ['src/test/integration/globalSetup.ts'],
    setupFiles:  ['src/test/integration/setupEnv.ts'],
    testTimeout: 30_000,
    hookTimeout: 180_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
