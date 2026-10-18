'use client';
import { useCallback, useEffect, useState } from 'react';
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Input, Modal, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { useApp } from '@/lib/client/app-context';

type Branch = { id: string; code: string; name: string; address: string | null; phone: string | null; is_main: number; is_active: number };
type Usage = { plan_name: string; max_branches: number; active_branches: number };
type Form = { id: string; code: string; name: string; address: string; phone: string; isMain: boolean; isActive: boolean; isNew: boolean };

/**
 * Sedes (locales) de la clínica. Las habilita el super admin (límite del plan o de la clínica).
 * readOnly: vista de la clínica. endpoint: /api/branches (clínica) o /api/admin/tenants/<id>/branches (super admin).
 */
export function BranchesTab({ endpoint = '/api/branches', readOnly = false }: { endpoint?: string; readOnly?: boolean }) {
  const toast = useToast();
  const { syncNow } = useApp();
  const [data, setData] = useState<{ branches: Branch[]; usage: Usage } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Branch | null>(null);

  const load = useCallback(() => { api<{ branches: Branch[]; usage: Usage }>(`${endpoint}?all=1`).then(setData); }, [endpoint]);
  useEffect(load, [load]);

  const full = data ? data.usage.active_branches >= data.usage.max_branches : false;

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { isNew: _n, ...body } = form;
      await api(endpoint, { body });
      toast.success('Sede guardada.');
      setForm(null); load(); void syncNow();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!del) return;
    try { await api(`${endpoint}/${del.id}`, { method: 'DELETE' }); toast.success('Sede eliminada.'); setDel(null); load(); void syncNow(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); setDel(null); }
  }

  if (!data) return <Spinner />;
  return (
    <Card className="max-w-3xl">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p>Plan <strong>{data.usage.plan_name}</strong>: <strong>{data.usage.active_branches}</strong> de <strong>{data.usage.max_branches}</strong> sede{data.usage.max_branches === 1 ? '' : 's'} activa{data.usage.max_branches === 1 ? '' : 's'}.</p>
          {readOnly
            ? <p className="text-xs text-muted">Las sedes las habilita OdontoSis según tu plan. Para abrir una nueva sede, envía una solicitud en Soporte y mejoras.</p>
            : full && <p className="text-xs text-muted">Límite alcanzado. Amplía el máximo de sedes de la clínica (Datos) o cambia su plan.</p>}
        </div>
        {!readOnly && <Button size="sm" icon={<Plus className="size-4" />} disabled={full} title={full ? 'Límite de sedes del plan alcanzado' : undefined}
          onClick={() => { setErrors({}); setForm({ id: crypto.randomUUID(), code: '', name: '', address: '', phone: '', isMain: false, isActive: true, isNew: true }); }}>
          Nueva sede
        </Button>}
      </div>
      <ul className="divide-y divide-line">
        {data.branches.map((b) => (
          <li key={b.id} className={b.is_active ? 'flex items-center gap-3 px-4 py-3' : 'flex items-center gap-3 px-4 py-3 opacity-60'}>
            <MapPin className="size-4 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{b.name} <span className="font-mono text-xs text-muted">{b.code}</span></p>
              <p className="truncate text-sm text-muted">{[b.address, b.phone].filter(Boolean).join(' · ') || 'Sin dirección'}</p>
            </div>
            {!!b.is_main && <Badge color="var(--brand)">Principal</Badge>}
            {!b.is_active && <Badge>Inactiva</Badge>}
            {!readOnly && <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => { setErrors({}); setForm({ id: b.id, code: b.code, name: b.name, address: b.address ?? '', phone: b.phone ?? '', isMain: !!b.is_main, isActive: !!b.is_active, isNew: false }); }}><Pencil className="size-4" /></Button>}
            {!readOnly && !b.is_main && <Button size="sm" variant="ghost" aria-label="Eliminar" className="text-danger" onClick={() => setDel(b)}><Trash2 className="size-4" /></Button>}
          </li>
        ))}
      </ul>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.isNew ? 'Nueva sede' : 'Editar sede'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} placeholder="Sede Mayolo" />
            <Input label="Código" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} error={errors.code} placeholder="MAYOLO" />
            <Input label="Dirección" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="sm:col-span-2" />
            <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <div className="flex flex-col justify-end gap-2">
              <Checkbox label="Sede principal" checked={form.isMain} onChange={(v) => setForm({ ...form, isMain: v, isActive: v ? true : form.isActive })} />
              {!form.isMain && <Checkbox label="Activa" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar sede" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar la sede <strong>{del?.name}</strong>? Las citas y presupuestos registrados conservan su sede.</p>
      </Modal>
    </Card>
  );
}
