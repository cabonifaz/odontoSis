'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Building2, Plus, Search } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/client/api';
import { formatDate } from '@/lib/shared/format';
import { PhaseBadge } from '../_components/tenant-phase';

type TenantRow = {
  id: string; code: string; legal_name: string; trade_name: string; tax_id: string | null;
  plan_name: string; status_code: string; status_name: string; status_color: string | null;
  max_users: number; active_users: number; subscription_start: string | null; subscription_end: string | null;
  implementation_start: string | null; implementation_end: string | null;
};

export default function TenantsPage() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<TenantRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api<TenantRow[]>(`/api/admin/tenants?q=${encodeURIComponent(q.trim())}`)
        .then((r) => { if (alive) setRows(r); })
        .catch((e) => { if (alive) { setRows([]); toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar.'); } });
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <>
      <PageHeader title="Clínicas" subtitle="Clínicas registradas en la plataforma"
        actions={<Link href="/admin/tenants/new"><Button icon={<Plus className="size-4" />}>Nueva clínica</Button></Link>} />
      <Card>
        <div className="border-b border-line p-4">
          <label htmlFor="tenant-search" className="sr-only">Buscar clínica</label>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input id="tenant-search" type="search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, código o RUC…"
              className="h-10 w-full rounded-control border border-line bg-surface pl-9 pr-3 text-sm text-fg placeholder:text-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </div>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<Building2 className="size-6" />} title={q ? 'Sin resultados' : 'Aún no hay clínicas'}
            description={q ? 'Prueba con otro término de búsqueda.' : 'Crea la primera clínica para empezar.'}
            action={!q && <Link href="/admin/tenants/new"><Button icon={<Plus className="size-4" />}>Nueva clínica</Button></Link>} />
        ) : (
          <Table>
            <thead>
              <tr><Th>Clínica</Th><Th>RUC</Th><Th>Plan</Th><Th>Usuarios</Th><Th>Estado</Th><Th>Acceso</Th><Th>Vence</Th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/admin/tenants/${t.id}`)}>
                  <Td>
                    <Link href={`/admin/tenants/${t.id}`} className="font-medium text-fg hover:text-brand" onClick={(e) => e.stopPropagation()}>
                      {t.trade_name}
                    </Link>
                    <div className="text-xs text-muted">{t.code}</div>
                  </Td>
                  <Td label="RUC">{t.tax_id || '—'}</Td>
                  <Td label="Plan">{t.plan_name}</Td>
                  <Td label="Usuarios">
                    <span className={t.active_users >= t.max_users ? 'font-medium text-warning' : undefined}>{t.active_users}/{t.max_users}</span>
                  </Td>
                  <Td label="Estado"><Badge color={t.status_color}>{t.status_name}</Badge></Td>
                  <Td label="Acceso"><PhaseBadge tenant={t} /></Td>
                  <Td label="Vence">{formatDate(t.status_code === 'IMPLEMENTATION' ? t.implementation_end : t.subscription_end)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
