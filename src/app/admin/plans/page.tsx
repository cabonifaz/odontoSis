'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, HardDrive, Layers, Pencil, Plus, UserRound, Users } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatMoney } from '@/lib/shared/format';

type Plan = {
  id: string; code: string; name: string; description: string | null; max_users: number; max_branches: number; max_patients: number | null;
  max_storage_mb: number; price: number; currency_code: string; currency_symbol: string | null;
  billing_period_code: string; billing_period_name: string; is_active: number | boolean; tenant_count: number;
};
type PlanForm = {
  id: string; code: string; name: string; description: string; maxUsers: string; maxBranches: string; maxPatients: string; maxStorageMb: string;
  price: string; currencyCode: string; periodCode: string; isActive: boolean;
};

const truthy = (v: number | boolean) => Number(v) === 1 || v === true;
const fmtStorage = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} GB` : `${mb} MB`);

export default function PlansPage() {
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [form, setForm] = useState<PlanForm | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPlans(await api<Plan[]>('/api/admin/plans'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar los planes.');
      setPlans([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setErrors({});
    setIsNew(true);
    setForm({ id: crypto.randomUUID(), code: '', name: '', description: '', maxUsers: '5', maxBranches: '1', maxPatients: '', maxStorageMb: '1024',
      price: '0', currencyCode: 'PEN', periodCode: 'MONTHLY', isActive: true });
  };
  const openEdit = (p: Plan) => {
    setErrors({});
    setIsNew(false);
    setForm({ id: p.id, code: p.code, name: p.name, description: p.description ?? '', maxUsers: String(p.max_users), maxBranches: String(p.max_branches ?? 1),
      maxPatients: p.max_patients != null ? String(p.max_patients) : '', maxStorageMb: String(p.max_storage_mb),
      price: String(p.price), currencyCode: p.currency_code, periodCode: p.billing_period_code, isActive: truthy(p.is_active) });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      await api('/api/admin/plans', { body: { ...form, code: form.code.trim().toUpperCase() } });
      toast.success(isNew ? 'Plan creado.' : 'Plan actualizado.');
      setForm(null);
      await load();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar el plan.');
    } finally {
      setSaving(false);
    }
  }

  const upd = (k: keyof PlanForm) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <PageHeader title="Planes" subtitle="Límites y precios de suscripción"
        actions={<Button icon={<Plus className="size-4" />} onClick={openNew}>Nuevo plan</Button>} />
      {!plans ? <Spinner /> : plans.length === 0 ? (
        <Card><EmptyState icon={<Layers className="size-6" />} title="Aún no hay planes" description="Crea un plan para poder registrar clínicas."
          action={<Button icon={<Plus className="size-4" />} onClick={openNew}>Nuevo plan</Button>} /></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold">{p.name}</h2>
                  <p className="font-mono text-xs text-muted">{p.code}</p>
                </div>
                {truthy(p.is_active) ? <Badge color="var(--success)">Activo</Badge> : <Badge>Inactivo</Badge>}
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">
                {formatMoney(p.price, p.currency_symbol || (p.currency_code === 'USD' ? '$' : 'S/'))}
                <span className="text-sm font-normal text-muted"> / {p.billing_period_name?.toLowerCase() || p.billing_period_code}</span>
              </p>
              {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Users className="size-4 text-muted" aria-hidden /><dt className="sr-only">Usuarios</dt><dd>{p.max_users} usuarios</dd></div>
                <div className="flex items-center gap-2"><Building2 className="size-4 text-muted" aria-hidden /><dt className="sr-only">Sedes</dt><dd>{p.max_branches ?? 1} sede{Number(p.max_branches ?? 1) === 1 ? '' : 's'}</dd></div>
                <div className="flex items-center gap-2"><UserRound className="size-4 text-muted" aria-hidden /><dt className="sr-only">Pacientes</dt><dd>{p.max_patients != null ? `${p.max_patients.toLocaleString('es-PE')} pacientes` : 'Pacientes ilimitados'}</dd></div>
                <div className="flex items-center gap-2"><HardDrive className="size-4 text-muted" aria-hidden /><dt className="sr-only">Almacenamiento</dt><dd>{fmtStorage(p.max_storage_mb)}</dd></div>
                <div className="flex items-center gap-2"><Building2 className="size-4 text-muted" aria-hidden /><dt className="sr-only">Clínicas</dt><dd>{p.tenant_count} {Number(p.tenant_count) === 1 ? 'clínica' : 'clínicas'}</dd></div>
              </dl>
              <div className="mt-auto flex justify-end pt-4">
                <Button variant="secondary" size="sm" icon={<Pencil className="size-4" />} onClick={() => openEdit(p)} aria-label={`Editar plan ${p.name}`}>Editar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={isNew ? 'Nuevo plan' : 'Editar plan'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button type="submit" form="plan-form" loading={saving}>Guardar</Button></>}>
        {form && (
          <form id="plan-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Input label="Código" required value={form.code} onChange={upd('code')} error={errors.code} hint="Ej.: BASICO, PRO" />
            <Input label="Nombre" required value={form.name} onChange={upd('name')} error={errors.name} />
            <Textarea label="Descripción" className="sm:col-span-2" value={form.description} onChange={upd('description')} error={errors.description} maxLength={500} />
            <Input label="Máximo de usuarios" type="number" min={1} max={1000} required value={form.maxUsers} onChange={upd('maxUsers')} error={errors.maxUsers} />
            <Input label="Máximo de sedes (locales)" type="number" min={1} max={500} required value={form.maxBranches} onChange={upd('maxBranches')} error={errors.maxBranches} />
            <Input label="Máximo de pacientes" type="number" min={1} value={form.maxPatients} onChange={upd('maxPatients')} error={errors.maxPatients} hint="Vacío = ilimitado" />
            <Input label="Almacenamiento (MB)" type="number" min={10} required value={form.maxStorageMb} onChange={upd('maxStorageMb')} error={errors.maxStorageMb} />
            <Input label="Precio" type="number" min={0} step="0.01" required value={form.price} onChange={upd('price')} error={errors.price} />
            <Select label="Moneda" value={form.currencyCode} onChange={upd('currencyCode')} error={errors.currencyCode}
              options={[{ value: 'PEN', label: 'Soles (PEN)' }, { value: 'USD', label: 'Dólares (USD)' }]} />
            <Select label="Periodo" value={form.periodCode} onChange={upd('periodCode')} error={errors.periodCode}
              options={[{ value: 'MONTHLY', label: 'Mensual' }, { value: 'YEARLY', label: 'Anual' }]} />
            <div className="sm:col-span-2">
              <Checkbox label="Plan activo (disponible para nuevas clínicas)" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
