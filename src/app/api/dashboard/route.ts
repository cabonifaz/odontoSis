import { route, tenantOf } from '@/lib/server/http';
import { tenantDashboard } from '@/lib/server/services/clinic';
import { todayIn } from '@/lib/shared/format';

/** Rango "hoy" calculado en la zona horaria de la clínica y convertido a UTC. */
function dayRange(tz: string) {
  const today = todayIn(tz);
  const probe = new Date(`${today}T12:00:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = probe.getTime() - local.getTime();
  const start = new Date(new Date(`${today}T00:00:00Z`).getTime() + offsetMs);
  return { start, end: new Date(start.getTime() + 86_400_000) };
}

export const GET = route({ platform: false }, async ({ user }) => {
  const { start, end } = dayRange(user.tenant!.timezone);
  const onlyMine = user.roleCode === 'DOCTOR' ? user.doctorId : null;
  return tenantDashboard(tenantOf(user), start, end, onlyMine);
});
