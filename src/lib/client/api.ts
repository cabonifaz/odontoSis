'use client';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: { path: string; message: string }[]) {
    super(message);
  }
  /** true si falló la red (no hubo respuesta del servidor) */
  get isNetwork() { return this.code === 'NETWORK'; }
}

/** fetch JSON same-origin con manejo uniforme de errores. */
export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('NETWORK', 'Sin conexión con el servidor.', 0);
  }
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
    window.location.href = '/login';
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(e.code ?? 'INTERNAL', e.message ?? 'Ocurrió un error inesperado.', res.status, e.details);
  }
  return data as T;
}

/** Errores de validación por campo -> { campo: mensaje } */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.details) return Object.fromEntries(err.details.map((d) => [d.path, d.message]));
  return {};
}
