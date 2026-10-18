'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Building2, CreditCard, Plus, Users, AlertTriangle, LifeBuoy } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Stat } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/client/api';
import { formatDate, formatMoney } from '@/lib/shared/format';

type Dash = {
  kpis: { tenants_total: number; tenants_active: number; users_active: number; paid_this_month: number; open_requests?: number };
  expiring: { id: string; trade_name: string; subscription_end: string; due_label?: string | null; status_name: string; status_color: string }[];
};

export default function AdminDashboard() {
  const toast = useToast();
  const [d, setD] = useState<Dash | null>(null);
  useEffect(() => {
    api<Dash>('/api/admin/dashboard').then(setD)
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'No se pudo cargar el resumen.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const openRequests = Number(d?.kpis.open_requests ?? 0);
  return (
    <>
      <PageHeader title="Resumen de plataforma" actions={<Link href="/admin/tenants/new"><Button icon={<Plus className="size-4" />}>Nueva clínica</Button></Link>} />
      {!d ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Stat label="Clínicas" value={d.kpis.tenants_total} icon={<Building2 className="size-5" />} />
            <Stat label="Activas" value={d.kpis.tenants_active} icon={<Building2 className="size-5" />} />
            <Stat label="Usuarios activos" value={d.kpis.users_active} icon={<Users className="size-5" />} />
            <Stat label="Cobrado este mes" value={formatMoney(d.kpis.paid_this_month)} icon={<CreditCard className="size-5" />} />
            <Link href="/admin/requests" className="col-span-2 rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:col-span-1"
              aria-label={`Solicitudes abiertas: ${openRequests}. Ver solicitudes`}>
              <Stat label="Solicitudes abiertas" value={openRequests} icon={<LifeBuoy className="size-5" />}
                hint={<span className="text-brand">Ver solicitudes →</span>} />
            </Link>
          </div>
          <Card className="mt-6">
            <div className="border-b border-line px-5 py-4"><h2 className="font-semibold">Vencimientos próximos (15 días)</h2></div>
            {d.expiring.length === 0 ? <EmptyState title="Sin vencimientos próximos" /> : (
              <ul className="divide-y divide-line">
                {d.expiring.map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/tenants/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-surface-2">
                      <AlertTriangle className="size-4 text-warning" aria-hidden />
                      <span className="min-w-0 flex-1 font-medium">{t.trade_name}</span>
                      <span className="text-sm text-muted">{t.due_label || 'Vence'}: {formatDate(t.subscription_end)}</span>
                      <Badge color={t.status_color}>{t.status_name}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
