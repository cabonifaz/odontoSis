'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CreditCard, FileText } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/client/api';
import { formatDate, formatMoney } from '@/lib/shared/format';

function Doc({ id, text }: { id: string | null; text: string }) {
  if (!id) return <span className="text-xs text-warning">Falta</span>;
  return <a href={`/api/files/${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"><FileText className="size-3.5" />{text}</a>;
}

type Payment = {
  invoice_number: string | null; invoice_file_id: string | null; receipt_file_id: string | null;
  id: string; tenant_id: string; tenant_name: string; plan_name: string; amount: number; currency_code: string;
  currency_symbol: string | null; period_start: string; period_end: string; paid_at: string | null;
  method_name: string | null; status_code: string; status_name: string; status_color: string | null; reference: string | null;
};
type TenantOpt = { id: string; trade_name: string };

const sym = (p: { currency_symbol: string | null; currency_code: string }) => p.currency_symbol || (p.currency_code === 'USD' ? '$' : 'S/');

export default function PaymentsPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [rows, setRows] = useState<Payment[] | null>(null);

  useEffect(() => {
    api<TenantOpt[]>('/api/admin/tenants').then(setTenants)
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar las clínicas.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let alive = true;
    api<Payment[]>(`/api/admin/payments${tenantId ? `?tenantId=${tenantId}` : ''}`)
      .then((r) => { if (alive) setRows(r); })
      .catch((e) => { if (alive) { setRows([]); toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar los pagos.'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Totales cobrados (PAID) en la lista visible, por moneda
  const totals = useMemo(() => {
    const m = new Map<string, { symbol: string; total: number; count: number }>();
    for (const p of rows ?? []) {
      if (p.status_code !== 'PAID') continue;
      const t = m.get(p.currency_code) ?? { symbol: sym(p), total: 0, count: 0 };
      t.total += Number(p.amount);
      t.count += 1;
      m.set(p.currency_code, t);
    }
    return [...m.entries()];
  }, [rows]);

  return (
    <>
      <PageHeader title="Pagos" subtitle="Pagos de suscripción de todas las clínicas" />
      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <Select label="Clínica" className="sm:w-72" value={tenantId} onChange={(e) => { setRows(null); setTenantId(e.target.value); }}
            placeholder="Todas las clínicas" options={tenants.map((t) => ({ value: t.id, label: t.trade_name }))} />
          <div className="text-sm sm:text-right" aria-live="polite">
            <p className="text-muted">Total cobrado (pagados en la lista)</p>
            {totals.length === 0 ? <p className="text-xl font-semibold">{formatMoney(0)}</p> : totals.map(([code, t]) => (
              <p key={code} className="text-xl font-semibold">{formatMoney(t.total, t.symbol)} <span className="text-xs font-normal text-muted">({t.count} {t.count === 1 ? 'pago' : 'pagos'})</span></p>
            ))}
          </div>
        </div>
      </Card>
      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="size-6" />} title="Sin pagos" description={tenantId ? 'Esta clínica no tiene pagos registrados.' : 'Aún no se registran pagos.'} />
        ) : (
          <Table>
            <thead><tr><Th>Clínica</Th><Th>Periodo</Th><Th>Plan</Th><Th>Monto</Th><Th>Pagado el</Th><Th>Método</Th><Th>Estado</Th><Th>Factura</Th><Th>Comprobante</Th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td><Link href={`/admin/tenants/${p.tenant_id}`} className="font-medium hover:text-brand">{p.tenant_name}</Link></Td>
                  <Td label="Periodo">{formatDate(p.period_start.slice(0, 10))} – {formatDate(p.period_end.slice(0, 10))}</Td>
                  <Td label="Plan">{p.plan_name}</Td>
                  <Td label="Monto">{formatMoney(p.amount, sym(p))}</Td>
                  <Td label="Pagado el">{p.paid_at ? formatDate(p.paid_at.slice(0, 10)) : '—'}</Td>
                  <Td label="Método">{p.method_name ?? '—'}</Td>
                  <Td label="Estado"><Badge color={p.status_color}>{p.status_name}</Badge></Td>
                  <Td label="Factura"><Doc id={p.invoice_file_id} text={p.invoice_number || 'Ver'} /></Td>
                  <Td label="Comprobante"><Doc id={p.receipt_file_id} text={p.reference || 'Ver'} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
