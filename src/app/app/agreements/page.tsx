'use client';
import { useCallback, useEffect, useState } from 'react';
import { Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Spinner, Table, Td, Textarea, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, can } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate, todayIn } from '@/lib/shared/format';

type Ag = { id: string; code: string; name: string; company_name: string | null; discount_pct: number; valid_from: string | null; valid_to: string | null; requires_member_code: number; notes: string | null; is_active: number; patient_count: number };
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
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<Handshake className="size-6" />} title="Sin convenios" description="Registra los acuerdos de la clínica con empresas, colegios o clubes." />
        ) : (
          <Table>
            <thead><tr><Th>Convenio</Th><Th>Empresa / club</Th><Th className="text-right">Descuento</Th><Th>Vigencia</Th><Th>Estado</Th><Th>Pacientes</Th><Th /></tr></thead>
            <tbody>
              {rows.map((a) => (
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
