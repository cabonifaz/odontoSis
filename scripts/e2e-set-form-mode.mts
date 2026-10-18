/**
 * SOLO pruebas (staging/desarrollo): cambia la ficha de paciente de la clínica demo.
 * Uso: node --conditions=react-server --import tsx scripts/e2e-set-form-mode.mts ADVANCED|STANDARD
 */
import 'dotenv/config';
import { getTenant, listTenants, updateTenant } from '@/lib/server/services/platform';

if (process.env.APP_ENV === 'production') throw new Error('No disponible en producción');
const mode = process.argv[2] === 'ADVANCED' ? 'ADVANCED' : 'STANDARD';
const d = (await listTenants('demo')).find((t) => t.code === 'demo');
if (!d) throw new Error('No existe la clínica demo');
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila de SP sin tipar (script de pruebas)
const t = (await getTenant(d.id as string)) as Record<string, any>;
const day = (v: string | null) => (v ? String(v).slice(0, 10) : null);
await updateTenant({ userId: null as unknown as string, ip: 'e2e' }, t.id, {
  legalName: t.legal_name, tradeName: t.trade_name, taxId: t.tax_id, email: t.email, phone: t.phone, address: t.address,
  planId: t.plan_id, statusCode: t.status_code, maxUsersOverride: t.max_users_override, currencyCode: t.currency_code,
  timezone: t.timezone, implementationStart: day(t.implementation_start), implementationEnd: day(t.implementation_end),
  implementationMaxPatients: t.implementation_max_patients, maxBranchesOverride: t.max_branches_override, patientFormMode: mode,
});
console.log(`ficha ${mode}`);
process.exit(0);
