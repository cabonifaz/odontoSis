'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { api, ApiError } from './api';
import { localDb, type OfflineDb } from './offline-db';
import type { ClientSession } from '@/lib/shared/types';
import type { SyncOp } from '@/lib/shared/schemas';

type OpResult = { opId: string; ok: boolean; error?: { code: string; message: string; details?: { path: string; message: string }[] }; data?: unknown };
type PullResponse = {
  serverTime: string;
  masters: Record<string, unknown>[]; doctors: Record<string, unknown>[]; services: Record<string, unknown>[];
  patients: Record<string, unknown>[]; appointments: Record<string, unknown>[]; budgets: Record<string, unknown>[];
  agreements: Record<string, unknown>[];
  branches: Record<string, unknown>[];
  priceLists: Record<string, unknown>[];
  priceListItems: Record<string, unknown>[];
};

type AppCtx = {
  session: ClientSession;
  db: OfflineDb | null;
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSync: string | null;
  syncNow: () => Promise<void>;
  /**
   * Envía una operación. Con conexión se procesa al instante (y lanza error de negocio si lo hay);
   * sin conexión se encola en IndexedDB y se sincroniza al reconectar.
   */
  submit: (op: Omit<SyncOp, 'opId'>, label: string, applyLocal?: (db: OfflineDb) => Promise<unknown>) => Promise<{ queued: boolean; data?: unknown }>;
};

const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp fuera de AppProvider');
  return c;
}

export function AppProvider({ session, children }: { session: ClientSession; children: ReactNode }) {
  const db = useMemo(() => (session.tenant ? localDb(session.userId, session.tenant.id) : null), [session.userId, session.tenant]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const busy = useRef(false);

  const pending = useLiveQuery(async () => db?.outbox.where('status').equals('pending').count() ?? 0, [db], 0);
  const failed = useLiveQuery(async () => db?.outbox.where('status').equals('error').count() ?? 0, [db], 0);

  const pull = useCallback(async () => {
    if (!db) return;
    const since = (await db.meta.get('lastSync'))?.value ?? '';
    const data = await api<PullResponse>(`/api/sync/pull?since=${encodeURIComponent(since)}`);
    // Los registros con cambios pendientes locales no se sobrescriben
    const pendingIds = new Set((await db.outbox.toArray()).map((o) => (o.payload as { id: string }).id));
    const apply = async (table: keyof Pick<OfflineDb, 'masters' | 'doctors' | 'services' | 'patients' | 'appointments' | 'budgets' | 'agreements' | 'branches' | 'priceLists' | 'priceListItems'>, rows: Record<string, unknown>[]) => {
      const t = db[table] as unknown as { bulkPut: (r: unknown[]) => Promise<unknown>; bulkDelete: (k: string[]) => Promise<unknown> };
      const live = rows.filter((r) => !r.deleted_at && !pendingIds.has(r.id as string)).map(({ deleted_at: _d, ...r }) => r);
      const gone = rows.filter((r) => r.deleted_at).map((r) => r.id as string);
      if (live.length) await t.bulkPut(live);
      if (gone.length) await t.bulkDelete(gone);
    };
    await db.transaction('rw', [db.masters, db.doctors, db.services, db.patients, db.appointments, db.budgets, db.agreements, db.branches, db.priceLists, db.priceListItems, db.meta], async () => {
      await apply('masters', data.masters);
      await apply('doctors', data.doctors);
      await apply('services', data.services);
      await apply('patients', data.patients);
      await apply('appointments', data.appointments);
      await apply('budgets', data.budgets);
      await apply('agreements', data.agreements ?? []);
      await apply('branches', data.branches ?? []);
      await apply('priceLists', data.priceLists ?? []);
      await apply('priceListItems', data.priceListItems ?? []);
      await db.meta.put({ key: 'lastSync', value: data.serverTime });
    });
    setLastSync(data.serverTime);
  }, [db]);

  const push = useCallback(async () => {
    if (!db) return;
    const ops = await db.outbox.where('status').equals('pending').sortBy('createdAt');
    if (!ops.length) return;
    const { results } = await api<{ results: OpResult[] }>('/api/sync/push', {
      body: { ops: ops.map(({ opId, type, payload }) => ({ opId, type, payload })) },
    });
    for (const r of results) {
      if (r.ok) await db.outbox.delete(r.opId);
      else await db.outbox.update(r.opId, { status: 'error', error: r.error?.message ?? 'Error' });
    }
  }, [db]);

  const syncNow = useCallback(async () => {
    if (!db || busy.current) return;
    busy.current = true;
    setSyncing(true);
    try {
      await push();
      await pull();
      setOnline(true);
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) setOnline(false);
    } finally {
      busy.current = false;
      setSyncing(false);
    }
  }, [db, push, pull]);

  const submit = useCallback<AppCtx['submit']>(async (op, label, applyLocal) => {
    const full = { ...op, opId: crypto.randomUUID() } as SyncOp;
    if (navigator.onLine) {
      try {
        const { results } = await api<{ results: OpResult[] }>('/api/sync/push', { body: { ops: [full] } });
        const r = results[0];
        if (!r.ok) throw new ApiError(r.error?.code ?? 'INTERNAL', r.error?.message ?? 'Error', 400, r.error?.details);
        setOnline(true);
        if (db && applyLocal) await applyLocal(db);
        void pull().catch(() => {});
        return { queued: false, data: r.data };
      } catch (e) {
        if (!(e instanceof ApiError && e.isNetwork)) throw e;
        setOnline(false);
      }
    }
    if (!db) throw new ApiError('NETWORK', 'Sin conexión.', 0);
    await db.outbox.put({ ...full, createdAt: Date.now(), status: 'pending', label });
    if (applyLocal) await applyLocal(db);
    return { queued: true };
  }, [db, pull]);

  useEffect(() => {
    if (!db) return;
    db.meta.get('lastSync').then((m) => setLastSync(m?.value ?? null));
    setOnline(navigator.onLine);
    void syncNow();
    const goOnline = () => { setOnline(true); void syncNow(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === 'visible' && navigator.onLine && void syncNow();
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => navigator.onLine && void syncNow(), 60_000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [db, syncNow]);

  const value: AppCtx = { session, db, online, syncing, pending: pending ?? 0, failed: failed ?? 0, lastSync, syncNow, submit };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Ítems de un catálogo maestro desde la base local (funciona offline). */
export function useMasters(tableCode: string) {
  const { db } = useApp();
  return useLiveQuery(
    async () => (db ? (await db.masters.where('table_code').equals(tableCode).toArray()).filter((m) => m.is_active).sort((a, b) => a.sort_order - b.sort_order) : []),
    [db, tableCode], [],
  );
}

/** Convenios activos y vigentes a una fecha (YYYY-MM-DD), desde la base local. */
export function useAgreements(date?: string) {
  const { db } = useApp();
  return useLiveQuery(
    async () => (db ? (await db.agreements.orderBy('name').toArray()).filter((a) => a.is_active
      && (!date || ((!a.valid_from || a.valid_from.slice(0, 10) <= date) && (!a.valid_to || a.valid_to.slice(0, 10) >= date)))) : []),
    [db, date], [],
  );
}

/** Sedes activas de la clínica (principal primero), desde la base local. */
export function useBranches() {
  const { db } = useApp();
  return useLiveQuery(
    async () => (db ? (await db.branches.toArray()).filter((b) => b.is_active).sort((a, b) => b.is_main - a.is_main || a.name.localeCompare(b.name)) : []),
    [db], [],
  );
}

/** Tarifarios activos (predeterminado primero) */
export function usePriceLists() {
  const { db } = useApp();
  return useLiveQuery(
    async () => (db ? (await db.priceLists.toArray()).filter((l) => l.is_active).sort((a, b) => b.is_default - a.is_default || a.name.localeCompare(b.name)) : []),
    [db], [],
  );
}

/** Precio de cada servicio en un tarifario (si no tiene precio propio, se usa el base) */
export function usePriceMap(priceListId: string | null | undefined) {
  const { db } = useApp();
  return useLiveQuery(
    async () => (db && priceListId ? new Map((await db.priceListItems.where('price_list_id').equals(priceListId).toArray()).map((i) => [i.service_id, Number(i.price)])) : new Map<string, number>()),
    [db, priceListId], new Map<string, number>(),
  );
}

/** Ficha efectiva: la de la sede (si la define) o la de la clínica */
export function useFormMode(branchId?: string | null): 'STANDARD' | 'ADVANCED' {
  const { session } = useApp();
  const branches = useBranches();
  const b = branchId ? branches.find((x) => x.id === branchId) : branches.find((x) => x.is_main) ?? branches[0];
  const own = b?.patient_form_mode;
  return own === 'ADVANCED' || own === 'STANDARD' ? own : session.tenant?.patientFormMode ?? 'STANDARD';
}

export const can = (s: ClientSession, perm: string) => s.permissions.includes(perm) || s.permissions.includes('platform.*');
