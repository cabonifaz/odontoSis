'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useMasters, can } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatMoney } from '@/lib/shared/format';

type Svc = { id: string; code: string; name: string; category_id: string | null; category_name: string | null; currency_code: string; currency_symbol: string; price: number; requires_lab: number; per_piece: number; is_active: number };
type Form = { id: string; code: string; name: string; categoryId: string; currencyCode: string; price: string; requiresLab: boolean; perPiece: boolean; isActive: boolean };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function ServicesPage() {
  const { session, syncNow } = useApp();
  const toast = useToast();
  const categories = useMasters('SERVICE_CATEGORY');
  const writable = can(session, 'services.write');
  const [rows, setRows] = useState<Svc[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Svc | null>(null);

  const load = useCallback(() => { api<Svc[]>(`/api/services?all=1`).then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);

  const filtered = useMemo(() => (rows ?? []).filter((s) => (!cat || s.category_id === cat) && (!q || norm(`${s.code} ${s.name}`).includes(norm(q)))), [rows, q, cat]);

  const open = (s?: Svc) => {
    setErrors({});
    setForm(s ? { id: s.id, code: s.code, name: s.name, categoryId: s.category_id ?? '', currencyCode: s.currency_code, price: String(s.price), requiresLab: !!s.requires_lab, perPiece: !!s.per_piece, isActive: !!s.is_active }
      : { id: crypto.randomUUID(), code: '', name: '', categoryId: '', currencyCode: session.tenant!.currencyCode, price: '', requiresLab: false, perPiece: true, isActive: true });
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      await api('/api/services', { body: { ...form, categoryId: form.categoryId || null, price: Number(form.price) } });
      toast.success('Servicio guardado.');
      setForm(null);
      load();
      void syncNow();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!del) return;
    try {
      await api(`/api/services/${del.id}`, { method: 'DELETE' });
      toast.success('Servicio eliminado.');
      setDel(null);
      load();
      void syncNow();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  return (
    <>
      <PageHeader title="Lista de precios" subtitle="Precios por pieza, incluyen IGV." actions={writable && <Button icon={<Plus className="size-4" />} onClick={() => open()}>Nuevo servicio</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label="Buscar" placeholder="Buscar servicio o código" value={q} onChange={(e) => setQ(e.target.value)} className="[&_input]:pl-9" />
          </div>
          <Select aria-label="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="Todas las categorías" options={categories.map((c) => ({ value: c.id, label: c.name }))} className="sm:w-56" />
        </div>
        {!rows ? <Spinner /> : filtered.length === 0 ? <EmptyState icon={<Tags className="size-6" />} title="Sin servicios" /> : (
          <Table>
            <thead><tr><Th>Código</Th><Th>Servicio</Th><Th>Categoría</Th><Th>Lab</Th><Th className="text-right">Precio</Th><Th /></tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className={s.is_active ? '' : 'opacity-60'}>
                  <Td label="Código" className="font-mono text-xs">{s.code}</Td>
                  <Td label="Servicio" className="font-medium">{s.name} {!s.is_active && <Badge>Inactivo</Badge>}</Td>
                  <Td label="Categoría">{s.category_name ?? '—'}</Td>
                  <Td label="Laboratorio">{s.requires_lab ? 'Sí' : '—'}</Td>
                  <Td label="Precio" className="text-right font-medium tabular-nums">{formatMoney(s.price, s.currency_symbol)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {writable && <>
                      <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => open(s)}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Eliminar" className="text-danger" onClick={() => setDel(s)}><Trash2 className="size-4" /></Button>
                    </>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={rows?.some((r) => r.id === form?.id) ? 'Editar servicio' : 'Nuevo servicio'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Código" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} error={errors.code} />
            <Select label="Categoría" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} placeholder="—" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            <Input label="Nombre del servicio" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} className="sm:col-span-2" />
            <Input label="Precio" type="number" min="0" step="0.01" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} error={errors.price} />
            <Select label="Moneda" value={form.currencyCode} onChange={(e) => setForm({ ...form, currencyCode: e.target.value })} options={[{ value: 'PEN', label: 'Soles (S/)' }, { value: 'USD', label: 'Dólares ($)' }]} />
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <Checkbox label="Requiere laboratorio" checked={form.requiresLab} onChange={(v) => setForm({ ...form, requiresLab: v })} />
              <Checkbox label="Precio por pieza" checked={form.perPiece} onChange={(v) => setForm({ ...form, perPiece: v })} />
              <Checkbox label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar servicio" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar <strong>{del?.name}</strong> de la lista de precios? Los presupuestos existentes no se modifican.</p>
      </Modal>
    </>
  );
}
