/**
 * Ambient shim for the test-only `embedded-postgres` dependency.
 *
 * The package ships real types, but exposes them through an ESM "exports" map
 * that this project's classic `moduleResolution: node` cannot follow. Vitest
 * resolves it fine at runtime — only `tsc --noEmit` trips.
 *
 * Declaring the handful of members globalSetup uses is contained; switching the
 * whole backend to node16/bundler resolution to satisfy a dev dependency would
 * change how the production build emits.
 */
declare module 'embedded-postgres' {
  export interface EmbeddedPostgresOptions {
    databaseDir: string;
    port: number;
    user: string;
    password: string;
    persistent: boolean;
    initdbFlags: string[];
    postgresFlags: string[];
  }

  export default class EmbeddedPostgres {
    constructor(options?: Partial<EmbeddedPostgresOptions>);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    dropDatabase(name: string): Promise<void>;
  }
}
