'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { LifeBuoy, MessageSquareReply } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDateTime } from '@/lib/shared/format';

type RequestRow = {
  id: string; tenant_id: string; tenant_name: string; type_code: string; type_name: string; type_color: string | null;
  status_code: string; status_name: string; status_color: string | null; title: string; description: string;
  response: string | null; created_at: string; updated_at: string | null; created_by_name: string | null;
};
type TenantOpt = { id: string; trade_name: string };

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Abierta' },
  { value: 'IN_PROGRESS', label: 'En proceso' },
  { value: 'DONE', label: 'Atendida' },
  { value: 'REJECTED', label: 'Descartada' },
];
/** Filtro especial: abiertas + en proceso (pendientes de atención) */
const PENDING = 'PENDING';

export default function RequestsPage() {
  const toast = useToast();
  const [tenants, setTenants] = useState<TenantOpt[]>([]);
  const [status, setStatus] = useState(PENDING);
  const [tenantId, setTenantId] = useState('');
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [current, setCurrent] = useState<RequestRow | null>(null);
  const [form, setForm] = useState({ statusCode: 'IN_PROGRESS', response: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const reqSeq = useRef(0);

  useEffect(() => {
    api<TenantOpt[]>('/api/admin/tenants').then(setTenants)
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar las clínicas.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    const qs = new URLSearchParams();
    if (status && status !== PENDING) qs.set('status', status);
    if (tenantId) qs.set('tenantId', tenantId);
    try {
      const q = qs.toString();
      let r = await api<RequestRow[]>(`/api/admin/requests${q ? `?${q}` : ''}`);
      if (status === PENDING) r = r.filter((x) => x.status_code === 'OPEN' || x.status_code === 'IN_PROGRESS');
      if (seq === reqSeq.current) setRows(r);
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setRows([]);
      toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar las solicitudes.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tenantId]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const open = (r: RequestRow) => {
    setErrors({});
    setCurrent(r);
    setForm({ statusCode: r.status_code === 'OPEN' ? 'IN_PROGRESS' : r.status_code, response: r.response ?? '' });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/admin/requests/${current.id}`, { method: 'PUT', body: { statusCode: form.statusCode, response: form.response.trim() || null } });
      toast.success('Solicitud actualizada.');
      setCurrent(null);
      await load();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'No se pudo actualizar la solicitud.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Solicitudes" subtitle="Mejoras, errores, consultas y capacitaciones solicitadas por las clínicas" />
      <Card className="mb-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <Select label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}
            placeholder="Todos los estados" options={[{ value: PENDING, label: 'Pendientes (abiertas y en proceso)' }, ...STATUS_OPTIONS]} />
          <Select label="Clínica" value={tenantId} onChange={(e) => setTenantId(e.target.value)}
            placeholder="Todas las clínicas" options={tenants.map((t) => ({ value: t.id, label: t.trade_name }))} />
        </div>
      </Card>

      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<LifeBuoy className="size-6" />} title="Sin solicitudes" description="No hay solicitudes con los filtros seleccionados." />
        ) : (
          <Table>
            <thead><tr><Th>Solicitud</Th><Th>Clínica</Th><Th>Tipo</Th><Th>Estado</Th><Th>Fecha</Th><Th className="text-right">Acciones</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <button type="button" onClick={() => open(r)} className="text-left font-medium hover:text-brand">{r.title}</button>
                    <p className="line-clamp-1 max-w-md text-xs text-muted">{r.description}</p>
                  </Td>
                  <Td label="Clínica"><Link href={`/admin/tenants/${r.tenant_id}`} className="hover:text-brand">{r.tenant_name}</Link></Td>
                  <Td label="Tipo"><Badge color={r.type_color}>{r.type_name}</Badge></Td>
                  <Td label="Estado"><Badge color={r.status_color}>{r.status_name}</Badge></Td>
                  <Td label="Fecha"><span className="whitespace-nowrap">{formatDateTime(r.created_at)}</span></Td>
                  <Td className="text-right">
                    <Button variant="secondary" size="sm" icon={<MessageSquareReply className="size-4" />} onClick={() => open(r)}
                      aria-label={`Atender solicitud ${r.title}`}>Atender</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!current} onClose={() => setCurrent(null)} title="Atender solicitud" size="lg"
        footer={<><Button variant="secondary" onClick={() => setCurrent(null)}>Cancelar</Button>
          <Button type="submit" form="request-form" loading={saving}>Guardar</Button></>}>
        {current && (
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={current.type_color}>{current.type_name}</Badge>
                <Badge color={current.status_color}>{current.status_name}</Badge>
              </div>
              <h3 className="text-base font-semibold">{current.title}</h3>
              <p className="text-xs text-muted">
                {current.tenant_name}{current.created_by_name && <> · {current.created_by_name}</>} · {formatDateTime(current.created_at)}
              </p>
              <p className="whitespace-pre-line break-words rounded-control bg-surface-2 p-3 text-sm">{current.description}</p>
            </div>
            <form id="request-form" onSubmit={submit} noValidate className="grid gap-4">
              <Select label="Estado" required value={form.statusCode} onChange={(e) => setForm({ ...form, statusCode: e.target.value })}
                error={errors.statusCode} options={STATUS_OPTIONS} className="sm:max-w-xs" />
              <Textarea label="Respuesta a la clínica" maxLength={5000} rows={5} value={form.response}
                onChange={(e) => setForm({ ...form, response: e.target.value })} error={errors.response}
                hint="La clínica verá esta respuesta junto a su solicitud." />
            </form>
          </div>
        )}
      </Modal>
    </>
  );
}
