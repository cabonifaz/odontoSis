import { route } from '@/lib/server/http';
import { dniSettingsSchema } from '@/lib/shared/schemas';
import { dniUsageSummary, saveDniSettings } from '@/lib/server/services/identity';

/** Consumo de la consulta de DNI contra el cupo mensual del proveedor (sólo super admin). */
export const GET = route({ platform: true }, async () => dniUsageSummary());

export const PUT = route({ platform: true }, async ({ user, ip, body }) => {
  await saveDniSettings({ userId: user.userId, ip }, await body(dniSettingsSchema));
  return dniUsageSummary();
});
