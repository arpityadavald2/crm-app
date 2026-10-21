import type { RequestHandler } from 'express';
import * as client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const labelNames = ['method', 'route', 'status_code'] as const;

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames,
  registers: [registry],
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/**
 * Measures every request (count, errors, duration).
 * The route label uses the matched pattern (e.g. /customers/:id), never the raw URL,
 * otherwise every unique URL would create a new time series and memory would explode.
 */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const stopTimer = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : 'unmatched';
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    stopTimer(labels);
  });
  next();
};
