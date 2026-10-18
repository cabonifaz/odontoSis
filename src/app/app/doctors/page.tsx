'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useApp, useMasters, can } from '@/lib/client/app-context';
import { api, ApiError, fieldErrors } from '@/lib/client/api';

type Doc = { id: string; user_id: string | null; user_email: string | null; first_name: string; last_name: string; license_number: string | null; specialty_id: string | null; specialty_name: string | null; email: string | null; phone: string | null; agenda_color: string; is_active: number };
type U = { id: string; full_name: string; email: string; role_code: string; doctor_id: string | null };
type Form = { id: string; userId: string; firstName: string; lastName: string; licenseNumber: string; specialtyId: string; email: string; phone: string; agendaColor: string; isActive: boolean };

export default function DoctorsPage() {
  const { session, syncNow } = useApp();
  const toast = useToast();
  const specialties = useMasters('SPECIALTY');
  const writable = can(session, 'doctors.write');
  const [rows, setRows] = useState<Doc[] | null>(null);
  const [users, setUsers] = useState<U[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Doc | null>(null);

  const load = useCallback(() => { api<Doc[]>('/api/doctors?all=1').then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => {
    load();
    if (can(session, 'users.manage')) api<{ users: U[] }>('/api/users').then((r) => setUsers(r.users)).catch(() => {});
  }, [load, session]);

  const open = (d?: Doc) => {
    setErrors({});
    setForm(d ? { id: d.id, userId: d.user_id ?? '', firstName: d.first_name, lastName: d.last_name, licenseNumber: d.license_number ?? '', specialtyId: d.specialty_id ?? '', email: d.email ?? '', phone: d.phone ?? '', agendaColor: d.agenda_color, isActive: !!d.is_active }
      : { id: crypto.randomUUID(), userId: '', firstName: '', lastName: '', licenseNumber: '', specialtyId: '', email: '', phone: '', agendaColor: '#0E7490', isActive: true });
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      await api('/api/doctors', { body: { ...form, userId: form.userId || null, specialtyId: form.specialtyId || null } });
      toast.success('Doctor guardado.');
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
      await api(`/api/doctors/${del.id}`, { method: 'DELETE' });
      toast.success('Doctor eliminado.');
      setDel(null);
      load();
      void syncNow();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  const linkable = users.filter((u) => !u.doctor_id || u.doctor_id === form?.id);

  return (
    <>
      <PageHeader title="Doctores" subtitle="Odontólogos de la clínica y su color en la agenda." actions={writable && <Button icon={<Plus className="size-4" />} onClick={() => open()}>Nuevo doctor</Button>} />
      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? <EmptyState icon={<Stethoscope className="size-6" />} title="Sin doctores registrados" /> : (
          <Table>
            <thead><tr><Th>Doctor</Th><Th>COP</Th><Th>Especialidad</Th><Th>Contacto</Th><Th>Usuario</Th><Th /></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className={d.is_active ? '' : 'opacity-60'}>
                  <Td label="Doctor"><span className="flex items-center gap-2 font-medium"><span className="size-3 rounded-full" style={{ backgroundColor: d.agenda_color }} aria-hidden />{d.first_name} {d.last_name}{!d.is_active && <Badge>Inactivo</Badge>}</span></Td>
                  <Td label="COP">{d.license_number ?? '—'}</Td>
                  <Td label="Especialidad">{d.specialty_name ?? '—'}</Td>
                  <Td label="Contacto"><span className="text-sm">{[d.phone, d.email].filter(Boolean).join(' · ') || '—'}</span></Td>
                  <Td label="Usuario">{d.user_email ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {writable && <>
                      <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => open(d)}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label="Eliminar" className="text-danger" onClick={() => setDel(d)}><Trash2 className="size-4" /></Button>
                    </>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title="Doctor"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombres" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} error={errors.firstName} />
            <Input label="Apellidos" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} error={errors.lastName} />
            <Input label="N° COP" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
            <Select label="Especialidad" value={form.specialtyId} onChange={(e) => setForm({ ...form, specialtyId: e.target.value })} placeholder="—" options={specialties.map((s) => ({ value: s.id, label: s.name }))} />
            <Input label="Correo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
            <Input label="Teléfono" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            {can(session, 'users.manage') && (
              <Select label="Usuario del sistema" hint="Para que vea su propia agenda" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="Sin usuario"
                options={linkable.map((u) => ({ value: u.id, label: `${u.full_name} (${u.email})` }))} />
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" htmlFor="agenda-color">Color en agenda</label>
              <input id="agenda-color" type="color" value={form.agendaColor} onChange={(e) => setForm({ ...form, agendaColor: e.target.value.toUpperCase() })} className="h-10 w-20 cursor-pointer rounded-control border border-line bg-surface" />
            </div>
            <Checkbox label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
        )}
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Eliminar doctor" size="sm"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Cancelar</Button><Button variant="danger" onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar a <strong>{del?.first_name} {del?.last_name}</strong>? Sus citas y presupuestos se conservan.</p>
      </Modal>
    </>
  );
}
