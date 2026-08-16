/** Shared between globalSetup (main process) and setupEnv (test workers). */
export const TEST_PG_PORT = 5434; // 5433 is the dev server from `npm run pg`
export const TEST_DATABASE_URL = `postgresql://postgres:postgres@localhost:${TEST_PG_PORT}/jiko_test`;
