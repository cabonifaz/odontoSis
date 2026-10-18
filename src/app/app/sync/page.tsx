'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { useApp } from '@/lib/client/app-context';
import { formatDateTime } from '@/lib/shared/format';

/** Cola de operaciones hechas sin conexión: pendientes y con error (para reintentar o descartar). */
export default function SyncPage() {
  const { db, online, syncing, syncNow, lastSync } = useApp();
  const ops = useLiveQuery(async () => db?.outbox.orderBy('createdAt').toArray(), [db]);

  return (
    <>
      <PageHeader title="Sincronización" subtitle={lastSync ? `Última sincronización: ${formatDateTime(lastSync)}` : 'Aún no se ha sincronizado'}
        actions={<Button icon={<RefreshCw className={syncing ? 'size-4 animate-spin' : 'size-4'} />} disabled={!online || syncing} onClick={() => void syncNow()}>Sincronizar ahora</Button>} />
      <Card>
        {!ops ? <Spinner /> : ops.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="size-6" />} title="Todo sincronizado" description="No hay cambios pendientes de enviar al servidor." />
        ) : (
          <ul className="divide-y divide-line">
            {ops.map((o) => (
              <li key={o.opId} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <p className="font-medium">{o.label}</p>
                  <p className="text-xs text-muted">{formatDateTime(new Date(o.createdAt))} · {o.type}</p>
                  {o.error && <p className="mt-1 text-sm text-danger">{o.error}</p>}
                </div>
                {o.status === 'error' ? <Badge color="var(--danger)">Error</Badge> : <Badge color="var(--warning)">Pendiente</Badge>}
                {o.status === 'error' && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={async () => { await db!.outbox.update(o.opId, { status: 'pending', error: undefined }); void syncNow(); }}>Reintentar</Button>
                    <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => db!.outbox.delete(o.opId)}>Descartar</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
