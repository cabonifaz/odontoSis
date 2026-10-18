import 'server-only';
import { randomUUID } from 'node:crypto';
import { callSp, spOne } from '../db';
import { blindIndex } from '../crypto';
import { AppError } from '../errors';

/**
 * Consulta de datos personales por DNI (RENIEC) vía proveedor externo (Decolecta / apis.net.pe).
 * El token sólo vive en variables de entorno del servidor; el cliente nunca lo ve.
 *   DNI_API_TOKEN   token del proveedor (sin token la consulta queda deshabilitada)
 *   DNI_API_URL     opcional; por defecto https://api.decolecta.com/v1/reniec/dni
 * El plan del proveedor tiene un cupo mensual compartido: antes de llamar se RESERVA la consulta de forma
 * atómica (sp_dni_reserve: cupo global, tope por clínica y por usuario) y luego se cierra con su resultado.
 * Las respuestas desde caché no consumen cupo.
 */
export type DniData = { documentNumber: string; firstName: string; lastName: string; motherLastName: string; fullName: string };
export type DniActor = { userId: string; tenantId: string | null };

type Outcome = 'FOUND' | 'NOT_FOUND' | 'ERROR' | 'QUOTA';

const cache = new Map<string, { at: number; data: DniData }>();
const TTL = 24 * 3600_000;

export const dniLookupEnabled = () => !!process.env.DNI_API_TOKEN;

export type DniQuota = { used: number; quota: number; alert_pct: number; cycle_start: string; cycle_end: string };
export const dniQuotaStatus = async () => (await spOne<DniQuota>('sp_dni_quota_status'))!;

const CAP_MESSAGES: Record<string, string> = {
  TENANT_CAP: 'Tu clínica alcanzó su tope mensual de consultas de DNI. Ingresa los datos manualmente.',
  USER_CAP: 'Alcanzaste el máximo de consultas de DNI por hoy. Ingresa los datos manualmente.',
};

async function finish(id: string, outcome: Outcome, billable: boolean, httpStatus: number | null) {
  try {
    await callSp('sp_dni_lookup_finish', [id, outcome, billable, httpStatus]);
  } catch (e) {
    console.error('[dni] no se pudo registrar el consumo', e instanceof Error ? e.message : e);
  }
}

export async function lookupDni(dni: string, actor: DniActor): Promise<DniData> {
  if (!/^\d{8}$/.test(dni)) throw new AppError('VALIDATION', 400, 'El DNI debe tener 8 dígitos.');
  const token = process.env.DNI_API_TOKEN;
  if (!token) throw new AppError('DNI_LOOKUP_DISABLED');

  const hit = cache.get(dni);
  if (hit && Date.now() - hit.at < TTL) return hit.data;

  const id = randomUUID();
  const r = await spOne<{ reason: string }>('sp_dni_reserve', [id, actor.tenantId, actor.userId, blindIndex(dni)]);
  if (r?.reason === 'QUOTA') throw new AppError('DNI_QUOTA_EXCEEDED');
  if (r?.reason !== 'OK') throw new AppError('DNI_QUOTA_EXCEEDED', 429, CAP_MESSAGES[r?.reason ?? ''] ?? undefined);
  const record = (_a: DniActor, _dni: string, outcome: Outcome, billable: boolean, httpStatus: number | null) => finish(id, outcome, billable, httpStatus);

  const base = process.env.DNI_API_URL || 'https://api.decolecta.com/v1/reniec/dni';
  let res: Response;
  try {
    res = await fetch(`${base}?numero=${dni}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    await record(actor, dni, 'ERROR', false, null);
    throw new AppError('DNI_LOOKUP_FAILED');
  }
  if (res.status === 404 || res.status === 422) {
    await record(actor, dni, 'NOT_FOUND', true, res.status);
    throw new AppError('DNI_NOT_FOUND');
  }
  if (res.status === 402 || res.status === 429) {
    // El proveedor rechazó por cupo/plan: avisar para ampliar el plan
    console.error('[dni] proveedor sin cupo', res.status);
    await record(actor, dni, 'QUOTA', false, res.status);
    throw new AppError('DNI_QUOTA_EXCEEDED');
  }
  if (!res.ok) {
    console.error('[dni] proveedor respondió', res.status);
    await record(actor, dni, 'ERROR', false, res.status);
    throw new AppError('DNI_LOOKUP_FAILED');
  }
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j) {
    await record(actor, dni, 'ERROR', true, res.status);
    throw new AppError('DNI_LOOKUP_FAILED');
  }

  // Formatos soportados: Decolecta (first_name, first_last_name, second_last_name) y apis.net.pe v2 (nombres, apellidoPaterno, apellidoMaterno)
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const data: DniData = {
    documentNumber: s(j.document_number) || s(j.numeroDocumento) || dni,
    firstName: s(j.first_name) || s(j.nombres),
    lastName: s(j.first_last_name) || s(j.apellidoPaterno),
    motherLastName: s(j.second_last_name) || s(j.apellidoMaterno),
    fullName: s(j.full_name) || s(j.nombreCompleto),
  };
  if (!data.firstName && !data.lastName) {
    await record(actor, dni, 'NOT_FOUND', true, res.status);
    throw new AppError('DNI_NOT_FOUND');
  }
  await record(actor, dni, 'FOUND', true, res.status);
  if (!data.fullName) data.fullName = [data.firstName, data.lastName, data.motherLastName].filter(Boolean).join(' ');
  cache.set(dni, { at: Date.now(), data });
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return data;
}

export const dniUsageSummary = async () => {
  const [summary, byTenant, byDay, history] = await callSp('sp_dni_usage_summary');
  return { enabled: dniLookupEnabled(), summary: summary[0], byTenant, byDay, history };
};

export const saveDniSettings = (a: { userId: string; ip: string | null }, s: { quota: number; alertPct: number; cycleDay: number; tenantCap: number; userCap: number }) =>
  callSp('sp_dni_settings_save', [a.userId, a.ip, s.quota, s.alertPct, s.cycleDay, s.tenantCap, s.userCap]);
