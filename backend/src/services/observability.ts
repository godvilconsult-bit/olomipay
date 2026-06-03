/**
 * Observability — request tracing + latency metrics.
 *
 * Zero new dependencies, zero behaviour change to existing routes.
 *  • Assigns every request an x-request-id (honours an inbound one if present)
 *    so a trace can be correlated client → API → logs (OpenTelemetry-style).
 *  • Records per-request latency into an in-memory ring buffer to expose
 *    p50 / p95 / p99 at /metrics — no external collector required.
 *  • Logs one structured line per request.
 *
 * Designed to be mounted FIRST so it wraps everything, but it never throws
 * and never blocks a response.
 */

import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const MAX_SAMPLES = 1000;
const latencies: number[] = [];       // rolling window of request durations (ms)
let   totalRequests = 0;
let   errorCount    = 0;
const startedAt     = Date.now();

function record(ms: number, statusCode: number) {
  totalRequests++;
  if (statusCode >= 500) errorCount++;
  latencies.push(ms);
  if (latencies.length > MAX_SAMPLES) latencies.shift();
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

/** Express middleware: tracing id + latency capture. Mount early. */
export function observability(req: Request, res: Response, next: NextFunction) {
  const inbound = (req.headers['x-request-id'] as string) || randomUUID();
  (req as any).requestId = inbound;
  res.setHeader('x-request-id', inbound);

  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      record(ms, res.statusCode);
      // Skip noisy health/metrics polling in logs
      if (req.path !== '/health' && req.path !== '/metrics' && req.path !== '/ready') {
        console.log(`[req] ${inbound.slice(0, 8)} ${req.method} ${req.path} ${res.statusCode} ${ms.toFixed(1)}ms`);
      }
    } catch { /* never let logging break a response */ }
  });

  next();
}

/** Snapshot for /metrics */
export function metricsSnapshot() {
  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    totalRequests,
    errorCount,
    errorRate: totalRequests ? +(errorCount / totalRequests).toFixed(4) : 0,
    latencyMs: {
      samples: sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? Math.round(sorted[sorted.length - 1]) : 0,
    },
  };
}
