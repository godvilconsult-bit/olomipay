/**
 * Boots an express app around a single router on an ephemeral port and talks to
 * it over real HTTP with Node's built-in fetch.
 *
 * Deliberately no supertest: this exercises the actual express stack — query
 * parsing, status codes, JSON serialisation — without adding a dependency.
 */
import express, { type Router } from 'express';
import { createServer, type Server } from 'node:http';

export interface TestClient {
  base: string;
  get(path: string): Promise<{ status: number; body: any }>;
  close(): Promise<void>;
}

export async function serveRouter(mountPath: string, router: Router): Promise<TestClient> {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);

  const server: Server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    async get(path: string) {
      const res = await fetch(base + path);
      const text = await res.text();
      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      return { status: res.status, body };
    },
    close() {
      return new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
