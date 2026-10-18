/**
 * SOLO pruebas (staging/desarrollo): ajusta el cupo mensual de DNI y muestra el consumo del ciclo.
 * Uso: node --conditions=react-server --import tsx scripts/e2e-set-dni-quota.mts [cupo|used]
 *   sin argumento imprime {"used","quota"}; "used" fija el cupo igual al consumo actual (cupo agotado)
 */
import 'dotenv/config';
import { dniQuotaStatus, saveDniSettings } from '@/lib/server/services/identity';

if (process.env.APP_ENV === 'production') throw new Error('No disponible en producción');
const arg = process.argv[2];
if (arg) {
  const q = await dniQuotaStatus();
  const quota = arg === 'used' ? Number(q.used) : Number(arg);
  await saveDniSettings({ userId: null as unknown as string, ip: 'e2e' }, { quota, alertPct: Number(q.alert_pct), cycleDay: 1 });
}
const s = await dniQuotaStatus();
console.log(JSON.stringify({ used: Number(s.used), quota: Number(s.quota) }));
process.exit(0);
