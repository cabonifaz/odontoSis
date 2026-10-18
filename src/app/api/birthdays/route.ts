import { route, tenantOf } from '@/lib/server/http';
import { birthdays } from '@/lib/server/services/clinic';
import { todayIn } from '@/lib/shared/format';
import { can } from '@/lib/shared/types';

/** Cumpleaños de los próximos 7 días: pacientes (ofertas comerciales) y personal (saludos / presentes) */
export const GET = route({ platform: false }, async ({ user }) => {
  const data = await birthdays(tenantOf(user), todayIn(user.tenant!.timezone), 7);
  // Los datos de contacto de pacientes sólo para quien puede verlos
  return { patients: can(user.permissions, 'patients.read') ? data.patients : [], staff: data.staff };
});
