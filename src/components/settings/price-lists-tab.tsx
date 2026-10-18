'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, cx, Input, Modal, Select, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { useApp, useBranches, can } from '@/lib/client/app-context';
import { formatMoney } from '@/lib/shared/format';

type PL = { id: string; code: string; name: string; group_name: string | null; branch_id: string | null; branch_name: string | null; is_default: number; is_active: number; item_count: number; patient_count: number };
type It = { service_id: string; code: string; name: string; base_price: number; list_price: number | null; effective_price: number; category_name: string | null };
type Form = { id: string; code: string; name: string; groupName: string; branchId: string; isDefault: boolean; isActive: boolean; isNew: boolean };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tarifarios (listas de precios): "Tipo de plan" + "Plan". El paciente tiene uno asignado y el presupuesto toma sus precios. */
export function PriceListsTab() {
  const toast = useToast();
  const { session, syncNow } = useApp();
  const branches = useBranches();
  const writable = can(session, 'services.write');
  const sym = session.tenant!.currencySymbol;
  const [lists, setLists] = useState<PL[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [items, setItems] = useState<It[] | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api<PL[]>('/api/price-lists?all=1').then((l) => { setLists(l); setSel((s) => s ?? l[0]?.id ?? null); });
  }, []);
  useEffect(load, [load]);
  useEffect(() => { if (sel) { setItems(null); setDraft({}); api<It[]>(`/api/price-lists/${sel}`).then(setItems); } }, [sel]);

  const filtered = useMemo(() => (items ?? []).filter((i) => !q || norm(`${i.code} ${i.name}`).includes(norm(q))), [items, q]);
  const current = lists?.find((l) => l.id === sel);

  async function saveList() {
    if (!form) return;
    try {
      const { isNew: _n, ...body } = form;
      await api('/api/price-lists', { body: { ...body, branchId: form.branchId || null, groupName: form.groupName || null } });
      toast.success('Tarifario guardado.');
      setForm(null); setSel(form.id); load(); void syncNow();
    } catch (e) { setErrors(fieldErrors(e)); toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }
  async function removeList(l: PL) {
    try { await api(`/api/price-lists/${l.id}`, { method: 'DELETE' }); toast.success('Tarifario eliminado.'); setSel(null); load(); void syncNow(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }
  async function setPrice(it: It, raw: string) {
    const price = raw.trim() === '' ? null : Number(raw);
    if (price !== null && (Number.isNaN(price) || price < 0)) { toast.error('Precio inválido.'); return; }
    if (price === (it.list_price === null ? null : Number(it.list_price))) return;
    try {
      await api(`/api/price-lists/${sel}`, { method: 'PUT', body: { serviceId: it.service_id, price } });
      setItems((xs) => xs?.map((x) => (x.service_id === it.service_id ? { ...x, list_price: price, effective_price: price ?? x.base_price } : x)) ?? null);
      void syncNow();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  if (!lists) return <Spinner />;
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="h-fit">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">Tarifarios</h3>
          {writable && <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => { setErrors({}); setForm({ id: crypto.randomUUID(), code: '', name: '', groupName: current?.group_name ?? '', branchId: '', isDefault: false, isActive: true, isNew: true }); }}>Nuevo</Button>}
        </div>
        <ul className="p-2">
          {lists.map((l) => (
            <li key={l.id}>
              <button onClick={() => setSel(l.id)} className={cx('w-full rounded-control px-3 py-2 text-left text-sm', sel === l.id ? 'bg-brand-soft text-brand' : 'hover:bg-surface-2', !l.is_active && 'opacity-60')}>
                <span className="block font-medium">{l.name}</span>
                <span className="block text-xs text-muted">{l.group_name ?? 'Tarifario general'}{l.branch_name ? ` · ${l.branch_name}` : ''} · {l.patient_count} pac.</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        {current && (
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{current.name} {!!current.is_default && <Badge color="var(--brand)">Predeterminado</Badge>}</p>
              <p className="text-xs text-muted">Deja el precio vacío para usar el precio base de la lista de precios.</p>
            </div>
            <div className="flex gap-2">
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <Input aria-label="Buscar servicio" placeholder="Buscar servicio" value={q} onChange={(e) => setQ(e.target.value)} className="[&_input]:pl-9" />
              </div>
              {writable && <Button size="sm" variant="ghost" aria-label="Editar tarifario" onClick={() => { setErrors({}); setForm({ id: current.id, code: current.code, name: current.name, groupName: current.group_name ?? '', branchId: current.branch_id ?? '', isDefault: !!current.is_default, isActive: !!current.is_active, isNew: false }); }}><Pencil className="size-4" /></Button>}
              {writable && !current.is_default && <Button size="sm" variant="ghost" aria-label="Eliminar tarifario" className="text-danger" onClick={() => removeList(current)}><Trash2 className="size-4" /></Button>}
            </div>
          </div>
        )}
        {!items ? <Spinner /> : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase text-muted">
                <tr><th className="px-4 py-2">Servicio</th><th className="px-2 py-2 text-right">Precio base</th><th className="w-36 px-4 py-2 text-right">Precio en este tarifario</th></tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.service_id} className="border-b border-line">
                    <td className="px-4 py-2"><span className="font-mono text-xs text-muted">{it.code}</span> {it.name}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted">{formatMoney(it.base_price, sym)}</td>
                    <td className="px-4 py-1.5 text-right">
                      <input aria-label={`Precio de ${it.name}`} type="number" min="0" step="0.01" disabled={!writable}
                        placeholder={String(Number(it.base_price).toFixed(2))}
                        value={draft[it.service_id] ?? (it.list_price === null ? '' : String(it.list_price))}
                        onChange={(e) => setDraft((d) => ({ ...d, [it.service_id]: e.target.value }))}
                        onBlur={(e) => void setPrice(it, e.target.value)}
                        className={cx('h-8 w-28 rounded-control border bg-surface px-2 text-right tabular-nums', it.list_price !== null ? 'border-brand font-semibold' : 'border-line')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Modal open={!!form} onClose={() => setForm(null)} title={form?.isNew ? 'Nuevo tarifario' : 'Editar tarifario'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={saveList}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Tipo de plan" placeholder="PLANES MULTIDENT" value={form.groupName} onChange={(e) => setForm({ ...form, groupName: e.target.value })} hint="Agrupa los planes" />
            <Input label="Nombre del plan" required placeholder="PARTICULAR MAYOLO" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
            <Input label="Código" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} error={errors.code} />
            <Select label="Sede" value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} placeholder="Todas las sedes" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <Checkbox label="Predeterminado" checked={form.isDefault} onChange={(v) => setForm({ ...form, isDefault: v, isActive: v ? true : form.isActive })} />
              {!form.isDefault && <Checkbox label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
