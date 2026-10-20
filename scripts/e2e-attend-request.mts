/**
 * SOLO pruebas (staging/desarrollo): el super admin atiende una solicitud (estado + respuesta) y se imprime
 * cuántas notificaciones de solicitudes nuevas tenía sin leer. Uso: … scripts/e2e-attend-request.mts <id> [DONE|IN_PROGRESS]
 */
import 'dotenv/config';
import { spOne, spRows } from '@/lib/server/db';
import { listTenants } from '@/lib/server/services/platform';
import { updateRequest } from '@/lib/server/services/platform';
import { notificationsFor } from '@/lib/server/services/notifications';

if (process.env.APP_ENV === 'production') throw new Error('No disponible en producción');
const [id, status = 'DONE'] = process.argv.slice(2);
const sa = await spOne<{ id: string }>('sp_auth_user_get_by_email', [process.env.SUPERADMIN_EMAIL]);
if (!sa) throw new Error('Falta el super admin');
const before = await notificationsFor(sa.id, 'requests', 50);
const notifiedNew = before.items.some((i) => i.entity_id === id && i.kind === 'REQUEST_CREATED' && !i.read_at);
await updateRequest({ userId: sa.id, ip: 'e2e' }, id, { statusCode: status as 'DONE', response: 'Listo: ya puedes imprimir desde el detalle del presupuesto.' });
// ¿Recibieron el aviso todos los administradores activos de la clínica?
const demo = (await listTenants('demo')).find((t) => t.code === 'demo')!;
const admins = (await spRows<{ id: string; role_code: string; is_active: number }>('sp_user_list', [demo.id])).filter((u) => u.role_code === 'CLINIC_ADMIN' && u.is_active);
let adminsNotified = 0;
for (const a of admins) if ((await notificationsFor(a.id, 'requests', 50)).items.some((i) => i.entity_id === id && i.kind === 'REQUEST_UPDATED')) adminsNotified++;
const pending = (await notificationsFor(sa.id, null, 1, true)).pending;
console.log(JSON.stringify({ superAdminNotified: notifiedNew, admins: admins.length, adminsNotified, pendingForPlatform: pending }));
process.exit(0);
