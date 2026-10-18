/**
 * SOLO pruebas (staging/desarrollo): saca a la clínica demo de la implementación (estado Suspendida) y la restaura.
 * Uso: node --conditions=react-server --import tsx scripts/e2e-import-phase.mts block|restore
 *   block   -> estado SUSPENDED e imprime {"status","spCode"} donde spCode es el error que devuelve el SP de importación
 *   restore -> estado IMPLEMENTATION (mismas fechas de implementación)
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { getTenant, listTenants, updateTenant } from '@/lib/server/services/platform';
import { callSp } from '@/lib/server/db';
import { AppError } from '@/lib/server/errors';

if (process.env.APP_ENV === 'production') throw new Error('No disponible en producción');
const action = process.argv[2] === 'block' ? 'block' : 'restore';
const d = (await listTenants('demo')).find((t) => t.code === 'demo');
if (!d) throw new Error('No existe la clínica demo');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila de SP sin tipar (script de pruebas)
const t = (await getTenant(d.id as string)) as Record<string, any>;
const day = (v: string | null) => (v ? String(v).slice(0, 10) : null);
const statusCode = action === 'block' ? 'SUSPENDED' : 'IMPLEMENTATION';
await updateTenant({ userId: null as unknown as string, ip: 'e2e' }, t.id, {
  legalName: t.legal_name, tradeName: t.trade_name, taxId: t.tax_id, email: t.email, phone: t.phone, address: t.address,
  planId: t.plan_id, statusCode, maxUsersOverride: t.max_users_override, currencyCode: t.currency_code,
  timezone: t.timezone, implementationStart: day(t.implementation_start), implementationEnd: day(t.implementation_end),
  implementationMaxPatients: t.implementation_max_patients, maxBranchesOverride: t.max_branches_override, patientFormMode: t.patient_form_mode,
});
let spCode: string | null = null;
if (action === 'block') {
  // El propio SP debe rechazar la importación (no sólo la pantalla o la API)
  try {
    await callSp('sp_import_batch_start', [t.id, null, 'e2e', randomUUID(), 'PATIENTS', 'e2e.csv', '0'.repeat(64), 1]);
    spCode = 'ALLOWED';
  } catch (e) {
    spCode = e instanceof AppError ? e.code : 'ERROR';
  }
}
console.log(JSON.stringify({ status: statusCode, spCode }));
process.exit(0);
