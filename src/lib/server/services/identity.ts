import 'server-only';
import { AppError } from '../errors';

/**
 * Consulta de datos personales por DNI (RENIEC) vía proveedor externo (Decolecta / apis.net.pe).
 * El token sólo vive en variables de entorno del servidor; el cliente nunca lo ve.
 *   DNI_API_TOKEN   token del proveedor (sin token la consulta queda deshabilitada)
 *   DNI_API_URL     opcional; por defecto https://api.decolecta.com/v1/reniec/dni
 */
export type DniData = { documentNumber: string; firstName: string; lastName: string; motherLastName: string; fullName: string };

const cache = new Map<string, { at: number; data: DniData }>();
const TTL = 24 * 3600_000;

export const dniLookupEnabled = () => !!process.env.DNI_API_TOKEN;

export async function lookupDni(dni: string): Promise<DniData> {
  if (!/^\d{8}$/.test(dni)) throw new AppError('VALIDATION', 400, 'El DNI debe tener 8 dígitos.');
  const token = process.env.DNI_API_TOKEN;
  if (!token) throw new AppError('DNI_LOOKUP_DISABLED');

  const hit = cache.get(dni);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const base = process.env.DNI_API_URL || 'https://api.decolecta.com/v1/reniec/dni';
  let res: Response;
  try {
    res = await fetch(`${base}?numero=${dni}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    throw new AppError('DNI_LOOKUP_FAILED');
  }
  if (res.status === 404 || res.status === 422) throw new AppError('DNI_NOT_FOUND');
  if (!res.ok) {
    console.error('[dni] proveedor respondió', res.status);
    throw new AppError('DNI_LOOKUP_FAILED');
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j) throw new AppError('DNI_LOOKUP_FAILED');

  // Formatos soportados: Decolecta (first_name, first_last_name, second_last_name) y apis.net.pe v2 (nombres, apellidoPaterno, apellidoMaterno)
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const data: DniData = {
    documentNumber: s(j.document_number) || s(j.numeroDocumento) || dni,
    firstName: s(j.first_name) || s(j.nombres),
    lastName: s(j.first_last_name) || s(j.apellidoPaterno),
    motherLastName: s(j.second_last_name) || s(j.apellidoMaterno),
    fullName: s(j.full_name) || s(j.nombreCompleto),
  };
  if (!data.firstName && !data.lastName) throw new AppError('DNI_NOT_FOUND');
  if (!data.fullName) data.fullName = [data.firstName, data.lastName, data.motherLastName].filter(Boolean).join(' ');
  cache.set(dni, { at: Date.now(), data });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return data;
}
