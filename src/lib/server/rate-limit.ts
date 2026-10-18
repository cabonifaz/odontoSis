import 'server-only';
import { AppError } from './errors';

/**
 * Límite de peticiones en memoria (ventana fija por clave). El bloqueo por cuenta vive en BD.
 * Acotado: como máximo MAX_KEYS claves (se descarta la más antigua, orden de inserción del Map)
 * y barrido periódico de ventanas vencidas, para que un atacante no pueda inflar memoria ni CPU.
 */
const MAX_KEYS = 50_000;
const hits = new Map<string, { count: number; reset: number }>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  sweep(now);
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    if (entry) hits.delete(key);
    else if (hits.size >= MAX_KEYS) hits.delete(hits.keys().next().value!);
    hits.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  entry.count++;
  if (entry.count > max) throw new AppError('RATE_LIMITED');
}

/**
 * Semáforo de concurrencia para operaciones caras (argon2): evita que una ráfaga sature CPU y el
 * threadpool de Node (que también sirve lecturas de archivos). Si la cola se llena, responde 429.
 */
export function semaphore(maxActive: number, maxQueue: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= maxActive) {
      if (queue.length >= maxQueue) throw new AppError('RATE_LIMITED', 429, 'El servidor está ocupado. Intenta en unos segundos.');
      await new Promise<void>((r) => queue.push(r)); // hereda el cupo de quien lo libera
    } else {
      active++;
    }
    try { return await fn(); } finally {
      const next = queue.shift();
      if (next) next(); else active--;
    }
  };
}
