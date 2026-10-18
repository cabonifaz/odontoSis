import 'server-only';
import { AppError } from './errors';

// Ventana fija en memoria (suficiente para una instancia). El bloqueo por cuenta vive en BD.
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return;
  }
  entry.count++;
  if (entry.count > max) throw new AppError('RATE_LIMITED');
}
