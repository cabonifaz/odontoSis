'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowLeft, Copy } from 'lucide-react';
import { Button, Card, Field, Input, Modal, PageHeader, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { todayIn } from '@/lib/shared/format';
import { TimezonePicker } from '@/components/timezone-picker';

type Plan = { id: string; name: string; max_users: number; is_active: number | boolean };

// "Activo (producción)" requiere un contrato: se habilita desde el detalle de la clínica
const STATUS_OPTIONS = [
  { value: 'IMPLEMENTATION', label: 'Implementación' },
  { value: 'SUSPENDED', label: 'Suspendido' },
];

function addDays(isoDate: string, n: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const CURRENCY_OPTIONS = [{ value: 'PEN', label: 'Soles (PEN)' }, { value: 'USD', label: 'Dólares (USD)' }];
const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({ label, value, onChange, error }: { label: string; value: string; onChange: (v: string) => void; error?: string }) {
  const id = label.replace(/\s+/g, '-').toLowerCase();
  return (
    <Field label={label} error={error} htmlFor={`${id}-hex`}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} (selector)`} value={HEX.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-control border border-line bg-surface p-1" />
        <input id={`${id}-hex`} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} aria-invalid={!!error || undefined}
          className="h-10 w-full rounded-control border border-line bg-surface px-3 font-mono text-sm uppercase text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-danger" />
      </div>
    </Field>
  );
}

export default function NewTenantPage() {
  const router = useRouter();
  const toast = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ id: string; adminEmail: string; tempPassword: string } | null>(null);
  const [f, setF] = useState({
    code: '', legalName: '', tradeName: '', taxId: '', email: '', phone: '', address: '',
    planId: '', statusCode: 'IMPLEMENTATION', maxUsersOverride: '', primaryColor: '#0E7490', secondaryColor: '#F59E0B',
    currencyCode: 'PEN', timezone: 'America/Lima',
    implementationStart: todayIn(), implementationEnd: addDays(todayIn(), 30), implementationMaxPatients: '200',
    adminEmail: '', adminName: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const on = (k: keyof typeof f) => (e: { target: { value: string } }) => set(k)(e.target.value);

  useEffect(() => {
    api<Plan[]>('/api/admin/plans')
      .then((p) => {
        const active = p.filter((x) => Number(x.is_active) === 1);
        setPlans(active);
        if (active[0]) setF((s) => (s.planId ? s : { ...s, planId: active[0].id }));
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar los planes.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const r = await api<{ id: string; adminEmail: string; tempPassword: string }>('/api/admin/tenants', {
        body: { ...f, code: f.code.trim().toLowerCase(), primaryColor: f.primaryColor.toUpperCase(), secondaryColor: f.secondaryColor.toUpperCase() },
      });
      toast.success('Clínica creada.');
      setCreated(r);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'No se pudo crear la clínica.');
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.tempPassword);
      toast.success('Contraseña copiada.');
    } catch {
      toast.error('No se pudo copiar. Cópiala manualmente.');
    }
  }

  const finish = () => { if (created) router.push(`/admin/tenants/${created.id}`); };
  const selectedPlan = plans.find((p) => p.id === f.planId);

  return (
    <>
      <PageHeader title="Nueva clínica" subtitle="Registra una clínica y su usuario administrador"
        actions={<Link href="/admin/tenants"><Button variant="secondary" icon={<ArrowLeft className="size-4" />}>Volver</Button></Link>} />
      <form onSubmit={submit} noValidate className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Datos de la clínica</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Código (identificador)" required value={f.code} onChange={on('code')} error={errors.code}
              hint="Letras, números y guiones. Ej.: sonrisa-feliz" autoComplete="off" />
            <Input label="RUC" value={f.taxId} onChange={on('taxId')} error={errors.taxId} inputMode="numeric" maxLength={20} />
            <Input label="Razón social" required value={f.legalName} onChange={on('legalName')} error={errors.legalName} />
            <Input label="Nombre comercial" required value={f.tradeName} onChange={on('tradeName')} error={errors.tradeName} />
            <Input label="Correo" type="email" value={f.email} onChange={on('email')} error={errors.email} />
            <Input label="Teléfono" type="tel" value={f.phone} onChange={on('phone')} error={errors.phone} />
            <Input label="Dirección" className="sm:col-span-2" value={f.address} onChange={on('address')} error={errors.address} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Plan y estado</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Plan" required value={f.planId} onChange={on('planId')} error={errors.planId}
              placeholder={plans.length ? undefined : 'Cargando planes…'}
              options={plans.map((p) => ({ value: p.id, label: `${p.name} (${p.max_users} usuarios)` }))} />
            <Select label="Estado" required value={f.statusCode} onChange={on('statusCode')} error={errors.statusCode} options={STATUS_OPTIONS}
              hint="“Activo (producción)” se habilita después de cargar un contrato en el detalle de la clínica." />
            <Input label="Máximo de usuarios (opcional)" type="number" min={1} max={1000} value={f.maxUsersOverride}
              onChange={on('maxUsersOverride')} error={errors.maxUsersOverride}
              hint={`Vacío = límite del plan${selectedPlan ? ` (${selectedPlan.max_users})` : ''}`} />
            <Select label="Moneda" value={f.currencyCode} onChange={on('currencyCode')} error={errors.currencyCode} options={CURRENCY_OPTIONS} />
            <TimezonePicker value={f.timezone} onChange={set('timezone')} error={errors.timezone} required />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Implementación</h2>
          <p className="mb-4 text-sm text-muted">Periodo para entrenamiento, carga de datos y pruebas; se puede ampliar.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Inicio de implementación" type="date" required={f.statusCode === 'IMPLEMENTATION'} value={f.implementationStart}
              onChange={on('implementationStart')} error={errors.implementationStart} />
            <Input label="Fin de implementación" type="date" required={f.statusCode === 'IMPLEMENTATION'} value={f.implementationEnd}
              min={f.implementationStart || undefined} onChange={on('implementationEnd')} error={errors.implementationEnd} />
            <Input label="Máximo de pacientes en implementación" type="number" min={1} max={100000} value={f.implementationMaxPatients}
              onChange={on('implementationMaxPatients')} error={errors.implementationMaxPatients} hint="Sugerido: 200. Vacío = límite del plan." />
          </div>
          <p className="mt-4 text-xs text-muted">El inicio y fin oficial de la suscripción se definen con los contratos que cargues en el detalle de la clínica.</p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-semibold">Marca</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Color primario" value={f.primaryColor} onChange={set('primaryColor')} error={errors.primaryColor} />
            <ColorField label="Color secundario" value={f.secondaryColor} onChange={set('secondaryColor')} error={errors.secondaryColor} />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 font-semibold">Usuario administrador</h2>
          <p className="mb-4 text-sm text-muted">Se generará una contraseña temporal que deberá cambiar en su primer ingreso.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Correo del administrador" type="email" required value={f.adminEmail} onChange={on('adminEmail')} error={errors.adminEmail} autoComplete="off" />
            <Input label="Nombre completo" required value={f.adminName} onChange={on('adminName')} error={errors.adminName} />
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link href="/admin/tenants"><Button variant="secondary" className="w-full sm:w-auto">Cancelar</Button></Link>
          <Button type="submit" loading={saving}>Crear clínica</Button>
        </div>
      </form>

      <Modal open={!!created} onClose={finish} title="Clínica creada" size="sm"
        footer={<Button onClick={finish}>Ir a la clínica</Button>}>
        {created && (
          <div className="space-y-4 text-sm">
            <p>Comparte estas credenciales con el administrador de la clínica:</p>
            <dl className="space-y-3">
              <div>
                <dt className="text-muted">Correo</dt>
                <dd className="font-medium break-all">{created.adminEmail}</dd>
              </div>
              <div>
                <dt className="text-muted">Contraseña temporal</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <code className="flex-1 rounded-control bg-surface-2 px-3 py-2 font-mono text-base break-all">{created.tempPassword}</code>
                  <Button variant="secondary" size="sm" onClick={copy} icon={<Copy className="size-4" />}>Copiar</Button>
                </dd>
              </div>
            </dl>
            <p className="flex gap-2 rounded-control bg-surface-2 p-3 text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              <span>Esta contraseña se muestra una sola vez. El usuario deberá cambiarla en su primer ingreso.</span>
            </p>
          </div>
        )}
      </Modal>
    </>
  );
}
