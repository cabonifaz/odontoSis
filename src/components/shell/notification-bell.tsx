'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, LifeBuoy, MessageSquareReply } from 'lucide-react';
import { cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/shared/format';
import { markRead, useNotifications, useOnNewNotifications, type NotificationItem } from '@/lib/client/notifications';

/** Número para insignias: 1–99, luego «99+» */
export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/** Campana del encabezado: notificaciones sin leer y las últimas recibidas */
export function NotificationBell({ timezone }: { timezone?: string }) {
  const { unread, items, loaded } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);

  // Aviso emergente cuando llega algo nuevo con la app abierta
  const onNew = useCallback((fresh: NotificationItem[]) => {
    const first = fresh[0];
    toast.info(fresh.length > 1 ? `Tienes ${fresh.length} notificaciones nuevas` : first.title);
  }, [toast]);
  useOnNewNotifications(onNew);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function go(n: NotificationItem) {
    setOpen(false);
    if (!n.read_at) void markRead({ id: n.id });
    if (n.link?.startsWith('/')) router.push(n.link);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true"
        aria-label={unread ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
        className="relative grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface">
            {badgeText(unread)}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notificaciones"
          className="absolute right-0 top-11 z-40 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-card border border-line bg-surface shadow-modal">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-semibold">Notificaciones</p>
            {unread > 0 && (
              <button type="button" onClick={() => void markRead()} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <CheckCheck className="size-3.5" /> Marcar todo como leído
              </button>
            )}
          </div>
          {!loaded ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No tienes notificaciones.</p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => go(n)} className={cx('flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-2', !n.read_at && 'bg-brand-soft/60')}>
                    <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
                      {n.kind === 'REQUEST_CREATED' ? <LifeBuoy className="size-4" /> : <MessageSquareReply className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block text-sm', !n.read_at && 'font-semibold')}>{n.title}</span>
                      {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-subtle">{formatDateTime(n.created_at, timezone)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" aria-label="Sin leer" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
