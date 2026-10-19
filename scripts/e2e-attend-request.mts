/**
 * SOLO pruebas (staging/desarrollo): el super admin atiende una solicitud (estado + respuesta) y se imprime
 * cuántas notificaciones de solicitudes nuevas tenía sin leer. Uso: … scripts/e2e-attend-request.mts <id> [DONE|IN_PROGRESS]
 */
import 'dotenv/config';
import { spOne } from '@/lib/server/db';
import { updateRequest } from '@/lib/server/services/platform';
import { notificationsFor } from '@/lib/server/services/notifications';

if (process.env.APP_ENV === 'production') throw new Error('No disponible en producción');
const [id, status = 'DONE'] = process.argv.slice(2);
const sa = await spOne<{ id: string }>('sp_auth_user_get_by_email', [process.env.SUPERADMIN_EMAIL]);
if (!sa) throw new Error('Falta el super admin');
const before = await notificationsFor(sa.id, 'requests', 50);
const notifiedNew = before.items.some((i) => i.entity_id === id && i.kind === 'REQUEST_CREATED' && !i.read_at);
await updateRequest({ userId: sa.id, ip: 'e2e' }, id, { statusCode: status as 'DONE', response: 'Listo: ya puedes imprimir desde el detalle del presupuesto.' });
console.log(JSON.stringify({ superAdminNotified: notifiedNew }));
process.exit(0);
