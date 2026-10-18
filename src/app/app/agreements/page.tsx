'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Handshake, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, Checkbox, cx, EmptyState, Input, Modal, PageHeader, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, can } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate, todayIn } from '@/lib/shared/format';

type Ag = { id: string; code: string; name: string; company_name: string | null; discount_pct: number; valid_from: string | null; valid_to: string | null; requires_member_code: number; notes: string | null; is_active: number; patient_count: number };
type Status = 'ALL' | 'CURRENT' | 'EXPIRED' | 'UPCOMING' | 'INACTIVE';
const STATUS_TABS: { value: Status; label: string }[] = [
  { value: 'ALL', label: 'Todos' }, { value: 'CURRENT', label: 'Vigentes' }, { value: 'UPCOMING', label: 'Por iniciar' },
  { value: 'EXPIRED', label: 'Vencidos' }, { value: 'INACTIVE', label: 'Inactivos' },
];
const PAGE = 50;
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Form = { id: string; code: string; name: string; companyName: string; discountPct: string; validFrom: string; validTo: string; requiresMemberCode: boolean; notes: string; isActive: boolean; isNew: boolean };

/** Convenios: acuerdos de promoción de la clínica con empresas o clubes (descuento sobre la lista de precios). */
export default function AgreementsPage() {
  const { session, syncNow } = useApp();
  const toast = useToast();
  const writable = can(session, 'settings.manage');
  const today = todayIn(session.tenant!.timezone);
  const [rows, setRows] = useState<Ag[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Ag | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('ALL');
  const [limit, setLimit] = useState(PAGE);

  const load = useCallback(() => { api<Ag[]>('/api/agreements?all=1').then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);

  const d = (v: string | null) => (v ? v.slice(0, 10) : '');
  const open = (a?: Ag) => {
    setErrors({});
    setForm(a ? { id: a.id, code: a.code, name: a.name, companyName: a.company_name ?? '', discountPct: String(a.discount_pct), validFrom: d(a.valid_from), validTo: d(a.valid_to), requiresMemberCode: !!a.requires_member_code, notes: a.notes ?? '', isActive: !!a.is_active, isNew: false }
      : { id: crypto.randomUUID(), code: '', name: '', companyName: '', discountPct: '10', validFrom: today, validTo: '', requiresMemberCode: false, notes: '', isActive: true, isNew: true });
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const { isNew: _n, ...body } = form;
      await api('/api/agreements', { body: { ...body, discountPct: Number(form.discountPct) } });
      toast.success('Convenio guardado.');
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
      await api(`/api/agreements/${del.id}`, { method: 'DELETE' });
      toast.success('Convenio eliminado.');
      setDel(null);
      load();
      void syncNow();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); setDel(null); }
  }

  const statusOf = (a: Ag): Exclude<Status, 'ALL'> =>
    !a.is_active ? 'INACTIVE' : a.valid_to && d(a.valid_to) < today ? 'EXPIRED' : a.valid_from && d(a.valid_from) > today ? 'UPCOMING' : 'CURRENT';

  // Búsqueda sin tildes por nombre, código o empresa; todas las palabras deben coincidir
  const filtered = useMemo(() => {
    const words = norm(q).split(/s+/).filter(Boolean);
    return (rows ?? [])
      .filter((a) => status === 'ALL' || statusOf(a) === status)
      .filter((a) => { const hay = norm(`${a.name} ${a.code} ${a.company_name ?? ''}`); return words.every((w) => hay.includes(w)); })
      .sort((x, y) => x.name.localeCompare(y.name, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, status, today]);
  const counts = useMemo(() => {
    const c: Record<Status, number> = { ALL: rows?.length ?? 0, CURRENT: 0, EXPIRED: 0, UPCOMING: 0, INACTIVE: 0 };
    (rows ?? []).forEach((a) => { c[statusOf(a)]++; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today]);
  useEffect(() => setLimit(PAGE), [q, status]);

  const vigencia = (a: Ag) => {
    if (!a.is_active) return <Badge>Inactivo</Badge>;
    if (a.valid_to && d(a.valid_to) < today) return <Badge color="var(--danger)">Vencido</Badge>;
    if (a.valid_from && d(a.valid_from) > today) return <Badge color="var(--info)">Por iniciar</Badge>;
    return <Badge color="var(--success)">Vigente</Badge>;
  };

  return (
    <>
      <PageHeader title="Maestro de convenios" subtitle="Acuerdos de promoción con empresas o clubes. En la ficha del paciente sólo se eligen convenios de este maestro; el descuento se aplica a la lista de precios en los presupuestos."
        actions={writable && <Button icon={<Plus className="size-4" />} onClick={() => open()}>Nuevo convenio</Button>} />
      <Card>
        {rows && rows.length > 0 && (
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar convenio"
                placeholder="Buscar por nombre, código o empresa"
                className="h-10 w-full rounded-control border border-line bg-surface pl-9 pr-9 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring" />
              {q && <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-subtle hover:bg-surface-2 hover:text-fg"><X className="size-4" /></button>}
            </div>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="tablist" aria-label="Filtrar por estado">
              {STATUS_TABS.map((t) => (
                <button key={t.value} type="button" role="tab" aria-selected={status === t.value} onClick={() => setStatus(t.value)}
                  className={cx('shrink-0 rounded-full border px-3 py-1 text-sm transition-colors', status === t.value ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-surface-2')}>
                  {t.label} <span className="tabular-nums opacity-70">{counts[t.value]}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted lg:ml-auto" aria-live="polite">{filtered.length === rows.length ? `${rows.length} convenios` : `${filtered.length} de ${rows.length}`}</p>
          </div>
        )}
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<Handshake className="size-6" />} title="Sin convenios" description="Registra los acuerdos de la clínica con empresas, colegios o clubes." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search className="size-6" />} title="Sin resultados" description="Prueba con otra palabra o cambia el filtro de estado." />
        ) : (
          <>
          <Table>
            <thead><tr><Th>Convenio</Th><Th>Empresa / club</Th><Th className="text-right">Descuento</Th><Th>Vigencia</Th><Th>Estado</Th><Th>Pacientes</Th><Th /></tr></thead>
            <tbody>
              {filtered.slice(0, limit).map((a) => (
                <tr key={a.id} className={a.is_active ? '' : 'opacity-60'}>
                  <Td label="Convenio"><p className="font-medium">{a.name}</p><p className="font-mono text-xs text-muted">{a.code}</p></Td>
                  <Td label="Empresa / club">{a.company_name ?? '—'}</Td>
                  <Td label="Descuento" className="text-right font-semibold tabular-nums">{Number(a.discount_pct)} %</Td>
                  <Td label="Vigencia">{a.valid_from ? formatDate(d(a.valid_from)) : 'Sin inicio'} – {a.valid_to ? formatDate(d(a.valid_to)) : 'Indefinido'}</Td>
                  <Td label="Estado">{vigencia(a)}</Td>
                  <Td label="Pacientes">{a.patient_count}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {writable && <>
                      <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => open(a)}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Eliminar" className="text-danger" onClick={() => setDel(a)}><Trash2 className="size-4" /></Button>
                    </>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {filtered.length > limit && (
            <div className="flex justify-center border-t border-line p-3">
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>Ver más ({filtered.length - limit} restantes)</Button>
            </div>
          )}
          </>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.isNew ? 'Nuevo convenio' : 'Editar convenio'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre del convenio" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} placeholder="Club Regatas 2026" className="sm:col-span-2" />
            <Input label="Código" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} error={errors.code} placeholder="REGATAS" />
            <Input label="Descuento (%)" type="number" min="0" max="100" step="0.01" required value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} error={errors.discountPct} />
            <Input label="Empresa o club" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="sm:col-span-2" />
            <Input label="Vigente desde" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} error={errors.validFrom} />
            <Input label="Vigente hasta" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} error={errors.validTo} hint="Vacío = indefinido" />
            <Textarea label="Condiciones / notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="sm:col-span-2" />
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <Checkbox label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar convenio" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar el convenio <strong>{del?.name}</strong>? Los presupuestos emitidos conservan el descuento aplicado.</p>
      </Modal>
    </>
  );
}
