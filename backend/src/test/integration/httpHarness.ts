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
  get(path: string, token?: string): Promise<{ status: number; body: any }>;
  post(path: string, body?: any, token?: string): Promise<{ status: number; body: any }>;
  del(path: string, token?: string): Promise<{ status: number; body: any }>;
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

  async function send(method: string, path: string, body?: any, token?: string) {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: res.status, body: parsed };
  }

  return {
    base,
    get:  (path, token)       => send('GET', path, undefined, token),
    post: (path, body, token) => send('POST', path, body, token),
    del:  (path, token)       => send('DELETE', path, undefined, token),
    close() {
      return new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}
