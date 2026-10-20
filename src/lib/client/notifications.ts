'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api, ApiError } from './api';
import { useApp } from './app-context';
import { parseDbDate, todayIn, zonedParts } from '@/lib/shared/format';

export type NotificationItem = {
  id: string; area: string; kind: string; title: string; body: string | null; link: string | null;
  entity_id: string | null; read_at: string | null; created_at: string;
};
type State = { unread: number; byArea: Record<string, number>; pending?: Record<string, number>; items: NotificationItem[]; loaded: boolean };

/**
 * Notificaciones del usuario: un único sondeo compartido (cada minuto, al volver a la pestaña y al
 * reconectar) para la campana, los contadores del menú y las pantallas. Sin conexión conserva lo último.
 */
let state: State = { unread: 0, byArea: {}, items: [], loaded: false };
const listeners = new Set<() => void>();
const newListeners = new Set<(items: NotificationItem[]) => void>();
let inflight: Promise<void> | null = null;
let started = 0;

function emit(next: State) {
  const fresh = state.loaded ? next.items.filter((i) => !i.read_at && !state.items.some((o) => o.id === i.id)) : [];
  state = next;
  listeners.forEach((l) => l());
  if (fresh.length) newListeners.forEach((l) => l(fresh));
}

export function refreshNotifications() {
  inflight ??= api<Omit<State, 'loaded'>>('/api/notifications')
    .then((r) => emit({ ...r, loaded: true }))
    .catch((e) => { if (!(e instanceof ApiError && e.isNetwork)) console.warn('[notificaciones]', e instanceof Error ? e.message : e); })
    .finally(() => { inflight = null; });
  return inflight;
}

export async function markRead(opts: { id?: string; area?: string } = {}) {
  // Actualización optimista: el contador baja al instante
  const hit = (i: NotificationItem) => !i.read_at && (opts.id ? i.id === opts.id : opts.area ? i.area === opts.area : true);
  const now = new Date().toISOString();
  const items = state.items.map((i) => (hit(i) ? { ...i, read_at: now } : i));
  const byArea = { ...state.byArea };
  if (opts.id) { const it = state.items.find((i) => i.id === opts.id && !i.read_at); if (it) byArea[it.area] = Math.max(0, (byArea[it.area] ?? 1) - 1); }
  else if (opts.area) byArea[opts.area] = 0;
  else Object.keys(byArea).forEach((k) => { byArea[k] = 0; });
  emit({ ...state, items, byArea, unread: Object.values(byArea).reduce((a, b) => a + b, 0) });
  try { await api('/api/notifications/read', { body: { id: opts.id ?? null, area: opts.area ?? null } }); } catch { /* se reintenta en el próximo sondeo */ }
}

export function useNotifications() {
  const snap = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
  useEffect(() => {
    if (started++ === 0) void refreshNotifications();
    const onVisible = () => document.visibilityState === 'visible' && void refreshNotifications();
    const onOnline = () => void refreshNotifications();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const t = window.setInterval(() => navigator.onLine && void refreshNotifications(), 60_000);
    return () => { started--; document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onOnline); window.clearInterval(t); };
  }, []);
  return snap;
}

/** Avisa cuando llegan notificaciones nuevas mientras la app está abierta (para mostrar un toast) */
export function useOnNewNotifications(cb: (items: NotificationItem[]) => void) {
  useEffect(() => { newListeners.add(cb); return () => { newListeners.delete(cb); }; }, [cb]);
}

const OPEN_BUDGET = new Set(['DRAFT', 'SENT']);
const PENDING_APPT = new Set(['SCHEDULED', 'CONFIRMED']);

/**
 * Pendientes del día calculados con los datos locales (funciona sin conexión):
 * presupuestos sin respuesta que vencen hoy y citas de hoy por atender (las propias si el usuario es doctor).
 */
export function useTodayCounts() {
  const { db, session } = useApp();
  const tz = session.tenant?.timezone ?? 'America/Lima';
  const today = todayIn(tz);
  const budgetsDueToday = useLiveQuery(async () => {
    if (!db) return 0;
    return db.budgets.filter((b) => !!b.valid_until && b.valid_until.slice(0, 10) === today && OPEN_BUDGET.has(b.status_code)).count();
  }, [db, today]) ?? 0;
  const appointmentsToday = useLiveQuery(async () => {
    if (!db) return 0;
    const mine = session.doctorId;
    return db.appointments.filter((a) => {
      if (!PENDING_APPT.has(a.status_code) || (mine && a.doctor_id !== mine)) return false;
      const d = parseDbDate(a.start_at);
      return !!d && zonedParts(d, tz).date === today;
    }).count();
  }, [db, today, tz, session.doctorId]) ?? 0;
  return { budgetsDueToday, appointmentsToday, today };
}

/**
 * Al entrar a una sección (p. ej. solicitudes): devuelve los registros que tenían novedades sin leer
 * —para marcarlos como «nuevo» en la lista— y luego marca esa área como leída.
 */
export function useSeenArea(area: string) {
  const { loaded, items } = useNotifications();
  const [fresh, setFresh] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!loaded || fresh) return;
    const ids = new Set(items.filter((i) => i.area === area && !i.read_at && i.entity_id).map((i) => i.entity_id!));
    setFresh(ids);
    if (ids.size || items.some((i) => i.area === area && !i.read_at)) void markRead({ area });
  }, [loaded, items, area, fresh]);
  // Lo que llegue mientras la pantalla está abierta también se marca como visto
  useEffect(() => {
    if (!fresh) return;
    const extra = items.filter((i) => i.area === area && !i.read_at && i.entity_id && !fresh.has(i.entity_id));
    if (extra.length) { setFresh(new Set([...fresh, ...extra.map((i) => i.entity_id!)])); void markRead({ area }); }
  }, [items, area, fresh]);
  return fresh ?? new Set<string>();
}
