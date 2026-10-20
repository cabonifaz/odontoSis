import 'server-only';
import { callSp, spOne, spRows } from '../db';

export type NotificationItem = {
  id: string; area: string; kind: string; title: string; body: string | null; link: string | null;
  entity_id: string | null; read_at: string | null; created_at: string;
};

/** Campana: contadores sin leer (total y por área) y las últimas notificaciones del usuario */
export async function notificationsFor(userId: string, area?: string | null, limit = 20, isPlatform = false) {
  const [summary, items] = await Promise.all([
    spRows<{ area: string; unread: number }>('sp_notification_summary', [userId]),
    spRows<NotificationItem>('sp_notification_list', [userId, area ?? null, limit]),
  ]);
  const byArea = Object.fromEntries(summary.map((r) => [r.area, Number(r.unread)]));
  // Super admin: además, cuántas solicitudes siguen pendientes de atención (indicador del menú)
  const pending = isPlatform ? { requests: Number((await spOne<{ pending: number }>('sp_request_pending_count', [null]))?.pending ?? 0) } : {};
  return { unread: Object.values(byArea).reduce((a, b) => a + b, 0), byArea, pending, items };
}

export const markNotificationsRead = (userId: string, opts: { id?: string | null; area?: string | null }) =>
  callSp('sp_notification_mark_read', [userId, opts.id ?? null, opts.area ?? null]);
