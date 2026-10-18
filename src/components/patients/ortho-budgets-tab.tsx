'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CloudOff, Plus } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import { can, useApp } from '@/lib/client/app-context';
import { api, ApiError } from '@/lib/client/api';
import { formatDate, formatMoney } from '@/lib/shared/format';
import type { OrthoBudgetRow } from '@/components/ortho/ortho-types';

/** Pestaña "Ortodoncia" de la ficha del paciente: sus presupuestos de ortodoncia. */
export function OrthoBudgetsTab({ patientId }: { patientId: string }) {
  const { session } = useApp();
  const [rows, setRows] = useState<OrthoBudgetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<OrthoBudgetRow[]>(`/api/ortho-budgets?patientId=${encodeURIComponent(patientId)}`)
      .then((r) => { if (alive) { setRows(r); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof ApiError && e.isNetwork ? 'offline' : e instanceof ApiError ? e.message : 'Error'); });
    return () => { alive = false; };
  }, [patientId]);

  const action = can(session, 'budgets.write') ? (
    <Link href={`/app/ortho-budgets/new?patientId=${patientId}`}><Button icon={<Plus className="size-4" />}>Nuevo presupuesto de ortodoncia</Button></Link>
  ) : null;

  if (error === 'offline') return <Card><EmptyState icon={<CloudOff className="size-6" />} title="No disponible sin conexión" description="Los presupuestos de ortodoncia se muestran cuando hay conexión." /></Card>;
  if (error) return <Card><EmptyState title="No se pudieron cargar los presupuestos de ortodoncia" description={error} /></Card>;
  if (!rows) return <Spinner />;
  if (!rows.length) return <Card><EmptyState title="Sin presupuestos de ortodoncia" action={action ?? undefined} /></Card>;

  return (
    <div className="space-y-3">
      {action && <div className="flex justify-end">{action}</div>}
      <Card>
        <ul className="divide-y divide-line">
          {rows.map((b) => (
            <li key={b.id}>
              <Link href={`/app/ortho-budgets/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-surface-2">
                <span className="font-mono text-xs text-muted">N° {b.budget_number}</span>
                <span className="text-sm">{formatDate(b.budget_date)}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted">
                  {b.appliance_name} · {Number(b.installments)} cuota{Number(b.installments) === 1 ? '' : 's'} de {formatMoney(b.installment_amount, b.currency_symbol)}
                </span>
                <span className="font-medium tabular-nums">{formatMoney(b.grand_total, b.currency_symbol)}</span>
                <Badge color={b.status_color}>{b.status_name}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
