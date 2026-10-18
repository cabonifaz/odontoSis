'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowLeft, CalendarPlus, Copy, CreditCard, FileSignature, FileText, ImageOff, KeyRound, Pencil, Plus, ShieldOff, Trash2, Upload, UserPlus, Users,
} from 'lucide-react';
import { ContractUpload } from '../../_components/contract-upload';
import { PhaseBadge, computeAccess } from '../../_components/tenant-phase';
import { TimezonePicker } from '@/components/timezone-picker';
import { DocumentUpload, type UploadedFile } from '@/components/file-upload';
import { TenantLoginLink } from '@/components/tenant-login-link';
import { BranchesTab } from '@/components/settings/branches-tab';
import { BulkImportPanel } from '@/components/import/bulk-import-panel';
import {
  Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Table, Tabs, Td, Textarea, Th, cx,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { formatDate, formatDateTime, formatMoney, todayIn } from '@/lib/shared/format';

// ---------------- Tipos (columnas snake_case de los SP) ----------------
type Tenant = {
  id: string; code: string; legal_name: string; trade_name: string; tax_id: string | null; email: string | null;
  phone: string | null; address: string | null; plan_id: string; plan_name: string; plan_max_users: number;
  max_users_override: number | null; max_users: number; max_branches_override: number | null; plan_max_branches: number; patient_form_mode: string | null; status_code: string; status_name: string; status_color: string | null;
  primary_color: string; secondary_color: string; logo_file_id: string | null; currency_code: string; timezone: string;
  subscription_start: string | null; subscription_end: string | null; active_users: number; patient_count: number;
  implementation_start: string | null; implementation_end: string | null; implementation_max_patients: number | null;
  contract_count: number;
};
type Contract = {
  id: string; contract_number: string; start_date: string; end_date: string; signed_at: string | null; notes: string | null;
  file_id: string; file_name: string | null; file_mime: string | null; created_at: string; is_current: number | boolean;
};
type Extension = { id: string; created_at: string; actor_name: string | null; previous_end: string | null; new_end: string | null; reason: string | null };
type Plan = { id: string; name: string; max_users: number; price: number; currency_code: string; billing_period_code: string; is_active: number | boolean };
type UserRow = {
  id: string; email: string; full_name: string; is_active: number | boolean; must_change_password: number | boolean;
  last_login_at: string | null; locked_until: string | null; role_code: string; role_name: string; totp_enabled?: number | boolean;
};
type Role = { id: string; code: string; name: string };
type Usage = { plan_name: string; max_users: number; active_users: number } | null;
type Payment = {
  id: string; tenant_id: string; plan_id: string; plan_name: string; amount: number; currency_code: string;
  currency_symbol: string | null; period_start: string; period_end: string; paid_at: string | null;
  method_code: string | null; method_name: string | null; status_code: string; status_name: string;
  status_color: string | null; reference: string | null; notes: string | null;
  invoice_number: string | null; invoice_file_id: string | null; invoice_file_name: string | null;
  receipt_file_id: string | null; receipt_file_name: string | null;
};

const STATUS_OPTIONS = [
  { value: 'IMPLEMENTATION', label: 'Implementación' },
  { value: 'ACTIVE', label: 'Activo (producción)' },
  { value: 'SUSPENDED', label: 'Suspendido' },
  { value: 'CANCELLED', label: 'Cancelado' },
];
// Respaldo por si el estado no trae color
const STATUS_COLORS: Record<string, string> = { IMPLEMENTATION: '#0EA5E9', ACTIVE: '#16A34A', SUSPENDED: '#F59E0B', CANCELLED: '#DC2626' };
const d10 = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
const CURRENCY_OPTIONS = [{ value: 'PEN', label: 'Soles (PEN)' }, { value: 'USD', label: 'Dólares (USD)' }];
const METHOD_OPTIONS = [
  { value: 'TRANSFER', label: 'Transferencia' }, { value: 'CARD', label: 'Tarjeta' }, { value: 'CASH', label: 'Efectivo' },
  { value: 'YAPE', label: 'Yape' }, { value: 'PLIN', label: 'Plin' },
];
const PAY_STATUS_OPTIONS = [{ value: 'PENDING', label: 'Pendiente' }, { value: 'PAID', label: 'Pagado' }, { value: 'VOID', label: 'Anulado' }];
const HEX = /^#[0-9a-fA-F]{6}$/;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO = 2 * 1024 * 1024;

const errMsg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const truthy = (v: number | boolean | null | undefined) => Number(v) === 1 || v === true;
const symbolFor = (cur: string) => (cur === 'USD' ? '$' : 'S/');

type Tab = 'datos' | 'contratos' | 'sedes' | 'marca' | 'usuarios' | 'pagos' | 'carga';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tab, setTab] = useState<Tab>('datos');

  const loadTenant = useCallback(async () => {
    try {
      setTenant(await api<Tenant>(`/api/admin/tenants/${id}`));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 400)) setNotFound(true);
      else toast.error(errMsg(e, 'No se pudo cargar la clínica.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadTenant();
    api<Plan[]>('/api/admin/plans').then(setPlans).catch((e) => toast.error(errMsg(e, 'No se pudieron cargar los planes.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTenant]);

  if (notFound) {
    return (
      <Card>
        <EmptyState title="Clínica no encontrada" description="Puede que haya sido eliminada o el enlace sea incorrecto."
          action={<Link href="/admin/tenants"><Button variant="secondary">Volver a clínicas</Button></Link>} />
      </Card>
    );
  }
  if (!tenant) return <Spinner />;
  const inImplementation = computeAccess(tenant).phase === 'IMPLEMENTATION';

  return (
    <>
      <PageHeader title={tenant.trade_name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{tenant.legal_name} · <span className="font-mono">{tenant.code}</span> · <Badge color={tenant.status_color ?? STATUS_COLORS[tenant.status_code]}>{tenant.status_name}</Badge>
          <PhaseBadge tenant={tenant} /></span>}
        actions={<Link href="/admin/tenants"><Button variant="secondary" icon={<ArrowLeft className="size-4" />}>Clínicas</Button></Link>} />
      <TenantLoginLink code={tenant.code} />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'datos', label: 'Datos' }, { value: 'contratos', label: `Contratos (${Number(tenant.contract_count) || 0})` },
        { value: 'sedes', label: 'Sedes' }, { value: 'marca', label: 'Marca' }, { value: 'usuarios', label: 'Usuarios' }, { value: 'pagos', label: 'Pagos' },
        // Carga masiva: sólo mientras la clínica está en implementación
        ...(inImplementation ? [{ value: 'carga' as const, label: 'Carga masiva' }] : []),
      ]} />
      {tab === 'datos' && (
        <div className="space-y-6">
          {/* key: re-monta el formulario cuando cambian datos derivados (contratos / ampliaciones) */}
          <DataTab key={`${tenant.subscription_start}|${tenant.subscription_end}|${tenant.implementation_end}|${tenant.status_code}|${tenant.contract_count}`}
            tenant={tenant} plans={plans} onSaved={loadTenant} />
          <ImplementationCard tenant={tenant} onChanged={loadTenant} />
        </div>
      )}
      {tab === 'contratos' && <ContractsTab tenant={tenant} onChanged={loadTenant} />}
      {tab === 'marca' && <BrandTab tenant={tenant} onSaved={loadTenant} />}
      {tab === 'usuarios' && <UsersTab tenantId={tenant.id} onChanged={loadTenant} />}
      {tab === 'pagos' && <PaymentsTab tenant={tenant} plans={plans} onChanged={loadTenant} />}
      {tab === 'sedes' && <BranchesTab endpoint={`/api/admin/tenants/${tenant.id}/branches`} />}
      {tab === 'carga' && inImplementation && <BulkImportPanel base={`/api/admin/tenants/${tenant.id}/import`} />}
    </>
  );
}

// ---------------- Datos ----------------
function DataTab({ tenant, plans, onSaved }: { tenant: Tenant; plans: Plan[]; onSaved: () => void }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [f, setF] = useState({
    legalName: tenant.legal_name, tradeName: tenant.trade_name, taxId: tenant.tax_id ?? '', email: tenant.email ?? '',
    phone: tenant.phone ?? '', address: tenant.address ?? '', planId: tenant.plan_id, statusCode: tenant.status_code,
    maxUsersOverride: tenant.max_users_override != null ? String(tenant.max_users_override) : '',
    maxBranchesOverride: tenant.max_branches_override != null ? String(tenant.max_branches_override) : '',
    patientFormMode: tenant.patient_form_mode === 'ADVANCED' ? 'ADVANCED' : 'STANDARD',
    currencyCode: tenant.currency_code, timezone: tenant.timezone || 'America/Lima',
    implementationStart: d10(tenant.implementation_start), implementationEnd: d10(tenant.implementation_end),
    implementationMaxPatients: tenant.implementation_max_patients != null ? String(tenant.implementation_max_patients) : '',
  });
  const hasContract = Number(tenant.contract_count) > 0;
  const inImplementation = f.statusCode === 'IMPLEMENTATION';
  const on = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const plan = plans.find((p) => p.id === f.planId);
  // Incluye el plan actual aunque esté inactivo
  const planOptions = plans.filter((p) => truthy(p.is_active) || p.id === tenant.plan_id)
    .map((p) => ({ value: p.id, label: `${p.name} (${p.max_users} usuarios)${truthy(p.is_active) ? '' : ' — inactivo'}` }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/admin/tenants/${tenant.id}`, { method: 'PUT', body: f });
      toast.success('Datos actualizados.');
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errMsg(err, 'No se pudo guardar.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Razón social" required value={f.legalName} onChange={on('legalName')} error={errors.legalName} />
          <Input label="Nombre comercial" required value={f.tradeName} onChange={on('tradeName')} error={errors.tradeName} />
          <Input label="RUC" value={f.taxId} onChange={on('taxId')} error={errors.taxId} inputMode="numeric" maxLength={20} />
          <Input label="Correo" type="email" value={f.email} onChange={on('email')} error={errors.email} />
          <Input label="Teléfono" type="tel" value={f.phone} onChange={on('phone')} error={errors.phone} />
          <Input label="Dirección" value={f.address} onChange={on('address')} error={errors.address} />
          <Select label="Plan" required value={f.planId} onChange={on('planId')} error={errors.planId} options={planOptions} />
          <Field label="Estado" required htmlFor="tenant-status" error={errors.statusCode}
            hint={hasContract ? undefined : '“Activo (producción)” requiere al menos un contrato (pestaña Contratos).'}>
            <select id="tenant-status" value={f.statusCode} onChange={on('statusCode')} aria-invalid={!!errors.statusCode || undefined}
              className="h-10 w-full rounded-control border border-line bg-surface px-3 pr-8 text-sm text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-danger">
              {/* Estado heredado (p. ej. TRIAL) que ya no está en la lista */}
              {!STATUS_OPTIONS.some((o) => o.value === f.statusCode) && <option value={f.statusCode}>{tenant.status_name}</option>}
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={o.value === 'ACTIVE' && !hasContract && tenant.status_code !== 'ACTIVE'}>
                  {o.label}{o.value === 'ACTIVE' && !hasContract ? ' — requiere contrato' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Input label="Máximo de usuarios (opcional)" type="number" min={1} max={1000} value={f.maxUsersOverride}
            onChange={on('maxUsersOverride')} error={errors.maxUsersOverride}
            hint={`Vacío = límite del plan${plan ? ` (${plan.max_users})` : ''}`} />
          <Select label="Ficha de paciente" value={f.patientFormMode} onChange={on('patientFormMode')}
            options={[{ value: 'STANDARD', label: 'Estándar (clínica de baja demanda)' }, { value: 'ADVANCED', label: 'Avanzada (clínica grande)' }]}
            hint="Cada sede puede sobrescribirla en la pestaña Sedes" />
          <Input label="Máximo de sedes (opcional)" type="number" min={1} max={500} value={f.maxBranchesOverride}
            onChange={on('maxBranchesOverride')} error={errors.maxBranchesOverride}
            hint={`Vacío = sedes del plan (${tenant.plan_max_branches ?? 1}). Las sedes se habilitan en la pestaña Sedes.`} />
          <Select label="Moneda" value={f.currencyCode} onChange={on('currencyCode')} error={errors.currencyCode} options={CURRENCY_OPTIONS} />
          <TimezonePicker value={f.timezone} onChange={(tz) => setF((s) => ({ ...s, timezone: tz }))} error={errors.timezone} required />
          <div className="hidden sm:block" />
          <Input label="Inicio de suscripción" value={formatDate(tenant.subscription_start)} readOnly disabled hint="Se definen con los contratos" />
          <Input label="Fin de suscripción" value={formatDate(tenant.subscription_end)} readOnly disabled hint="Se definen con los contratos" />
        </div>
        {inImplementation && (
          <div className="mt-6 border-t border-line pt-5">
            <h3 className="mb-1 text-sm font-semibold">Periodo de implementación</h3>
            <p className="mb-4 text-xs text-muted">Entrenamiento, carga de datos y pruebas. Para extenderlo con registro del motivo usa “Ampliar implementación”.</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="Inicio" type="date" required value={f.implementationStart} onChange={on('implementationStart')} error={errors.implementationStart} />
              <Input label="Fin" type="date" required min={f.implementationStart || undefined} value={f.implementationEnd}
                onChange={on('implementationEnd')} error={errors.implementationEnd} />
              <Input label="Máx. pacientes en implementación" type="number" min={1} max={100000} value={f.implementationMaxPatients}
                onChange={on('implementationMaxPatients')} error={errors.implementationMaxPatients} hint="Sugerido: 200" />
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button type="submit" loading={saving}>Guardar cambios</Button>
        </div>
      </Card>
    </form>
  );
}

// ---------------- Implementación (ampliaciones) ----------------
function ImplementationCard({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Extension[] | null>(null);
  const [form, setForm] = useState<{ newEnd: string; reason: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const currentEnd = d10(tenant.implementation_end);
  const canExtend = tenant.status_code === 'IMPLEMENTATION' && !!currentEnd;

  const load = useCallback(async () => {
    try {
      setRows(await api<Extension[]>(`/api/admin/tenants/${tenant.id}/implementation`));
    } catch (e) {
      setRows([]);
      toast.error(errMsg(e, 'No se pudo cargar el historial de implementación.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);
  useEffect(() => { load(); }, [load]);

  const open = () => {
    setErrors({});
    setForm({ newEnd: addDays(currentEnd || todayIn(), 15), reason: '' });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (currentEnd && form.newEnd <= currentEnd) { setErrors({ newEnd: 'Debe ser posterior al fin actual.' }); return; }
    setSaving(true);
    setErrors({});
    try {
      await api(`/api/admin/tenants/${tenant.id}/implementation`, { body: form });
      toast.success('Implementación ampliada.');
      setForm(null);
      await load();
      onChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errMsg(err, 'No se pudo ampliar la implementación.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Implementación</h2>
          <p className="text-sm text-muted">
            {tenant.implementation_start || tenant.implementation_end
              ? <>Del {formatDate(d10(tenant.implementation_start))} al {formatDate(currentEnd)}{tenant.implementation_max_patients != null && <> · máx. {tenant.implementation_max_patients} pacientes</>}</>
              : 'Sin periodo de implementación registrado.'}
          </p>
        </div>
        <Button variant="secondary" icon={<CalendarPlus className="size-4" />} onClick={open} disabled={!canExtend}
          title={canExtend ? undefined : 'Sólo disponible para clínicas en estado Implementación'}>Ampliar implementación</Button>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Sin ampliaciones registradas.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-start sm:gap-4">
              <span className="shrink-0 text-muted sm:w-36">{formatDateTime(r.created_at)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{formatDate(d10(r.previous_end))} → {formatDate(d10(r.new_end))}</p>
                {r.reason && <p className="whitespace-pre-line break-words text-muted">{r.reason}</p>}
              </div>
              {r.actor_name && <span className="shrink-0 text-xs text-muted">{r.actor_name}</span>}
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title="Ampliar implementación" size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button type="submit" form="extend-form" loading={saving}>Ampliar</Button></>}>
        {form && (
          <form id="extend-form" onSubmit={submit} noValidate className="space-y-4">
            <p className="text-sm text-muted">Fin actual: <span className="font-medium text-fg">{formatDate(currentEnd)}</span></p>
            <Input label="Nueva fecha de fin" type="date" required min={currentEnd ? addDays(currentEnd, 1) : undefined} value={form.newEnd}
              onChange={(e) => setForm({ ...form, newEnd: e.target.value })} error={errors.newEnd} />
            <Textarea label="Motivo" required maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
              error={errors.reason} placeholder="Ej.: la clínica necesita más tiempo para cargar su historial de pacientes." />
          </form>
        )}
      </Modal>
    </Card>
  );
}

// ---------------- Contratos ----------------
type ContractForm = {
  id: string; contractNumber: string; startDate: string; endDate: string; signedAt: string; notes: string; file: UploadedFile | null;
};

function ContractsTab({ tenant, onChanged }: { tenant: Tenant; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Contract[] | null>(null);
  const [form, setForm] = useState<ContractForm | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Contract | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<Contract[]>(`/api/admin/tenants/${tenant.id}/contracts`));
    } catch (e) {
      setRows([]);
      toast.error(errMsg(e, 'No se pudieron cargar los contratos.'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    // Por defecto, el nuevo contrato empieza al día siguiente del último (o hoy) y dura un año
    const lastEnd = (rows ?? []).reduce((m, c) => (d10(c.end_date) > m ? d10(c.end_date) : m), '');
    const start = lastEnd ? addDays(lastEnd, 1) : todayIn();
    const end = addDays(addYears(start, 1), -1);
    setErrors({});
    setIsNew(true);
    setForm({ id: crypto.randomUUID(), contractNumber: '', startDate: start, endDate: end, signedAt: '', notes: '', file: null });
  };
  const openEdit = (c: Contract) => {
    setErrors({});
    setIsNew(false);
    setForm({
      id: c.id, contractNumber: c.contract_number, startDate: d10(c.start_date), endDate: d10(c.end_date), signedAt: d10(c.signed_at),
      notes: c.notes ?? '', file: { id: c.file_id, name: c.file_name || 'Contrato' },
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.file) { setErrors({ fileId: 'Adjunta el contrato firmado' }); return; }
    setSaving(true);
    setErrors({});
    try {
      const { file, ...rest } = form;
      await api(`/api/admin/tenants/${tenant.id}/contracts`, { body: { ...rest, fileId: file.id } });
      toast.success(isNew ? 'Contrato registrado.' : 'Contrato actualizado.');
      setForm(null);
      await load();
      onChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errMsg(err, 'No se pudo guardar el contrato.'));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/api/admin/tenants/${tenant.id}/contracts/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Contrato eliminado.');
      setToDelete(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo eliminar el contrato.'));
    } finally {
      setDeleting(false);
    }
  }

  const upd = (k: 'contractNumber' | 'startDate' | 'endDate' | 'signedAt' | 'notes') =>
    (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          Suscripción oficial: <span className="font-medium text-fg">{formatDate(tenant.subscription_start)} – {formatDate(tenant.subscription_end)}</span>.
          {' '}Se calcula con el inicio del primer contrato y el fin del último.
        </p>
        <Button icon={<Plus className="size-4" />} onClick={openNew}>Nuevo contrato</Button>
      </div>
      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<FileSignature className="size-6" />} title="Sin contratos"
            description="Carga el contrato firmado para poder pasar la clínica a producción (estado Activo)."
            action={<Button icon={<Plus className="size-4" />} onClick={openNew}>Nuevo contrato</Button>} />
        ) : (
          <Table>
            <thead><tr><Th>N° de contrato</Th><Th>Vigencia</Th><Th>Firmado el</Th><Th>Archivo</Th><Th>Notas</Th><Th className="text-right">Acciones</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <span className="inline-flex flex-wrap items-center gap-2 font-medium">
                      {c.contract_number}
                      {truthy(c.is_current) && <Badge color="var(--success)">Vigente</Badge>}
                    </span>
                  </Td>
                  <Td label="Vigencia">{formatDate(d10(c.start_date))} – {formatDate(d10(c.end_date))}</Td>
                  <Td label="Firmado el">{c.signed_at ? formatDate(d10(c.signed_at)) : '—'}</Td>
                  <Td label="Archivo"><DocLink id={c.file_id} text={c.file_name || 'Ver contrato'} /></Td>
                  <Td label="Notas"><span className="line-clamp-2 max-w-xs text-muted">{c.notes || '—'}</span></Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Editar contrato ${c.contract_number}`} title="Editar" onClick={() => openEdit(c)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-danger" aria-label={`Eliminar contrato ${c.contract_number}`} title="Eliminar"
                        onClick={() => setToDelete(c)}><Trash2 className="size-4" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={isNew ? 'Nuevo contrato' : 'Editar contrato'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button type="submit" form="contract-form" loading={saving}>Guardar</Button></>}>
        {form && (
          <form id="contract-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Input label="N° de contrato" required maxLength={40} value={form.contractNumber} onChange={upd('contractNumber')} error={errors.contractNumber} />
            <Input label="Fecha de firma" type="date" value={form.signedAt} onChange={upd('signedAt')} error={errors.signedAt} />
            <Input label="Inicio de vigencia" type="date" required value={form.startDate} onChange={upd('startDate')} error={errors.startDate} />
            <Input label="Fin de vigencia" type="date" required min={form.startDate || undefined} value={form.endDate} onChange={upd('endDate')} error={errors.endDate} />
            <div className="sm:col-span-2">
              <ContractUpload required value={form.file} error={errors.fileId}
                onChange={(v) => setForm((x) => (x ? { ...x, file: v } : x))} />
            </div>
            <Textarea label="Notas" className="sm:col-span-2" maxLength={500} value={form.notes} onChange={upd('notes')} error={errors.notes} />
            <p className="text-xs text-muted sm:col-span-2">Las fechas no pueden cruzarse con otro contrato de la clínica.</p>
          </form>
        )}
      </Modal>

      <ConfirmModal open={!!toDelete} title="Eliminar contrato" confirmLabel="Eliminar" danger loading={deleting}
        onConfirm={remove} onClose={() => setToDelete(null)}>
        ¿Eliminar el contrato <strong>{toDelete?.contract_number}</strong> ({formatDate(d10(toDelete?.start_date))} – {formatDate(d10(toDelete?.end_date))})?
        Las fechas oficiales de la suscripción se recalcularán.
      </ConfirmModal>
    </>
  );
}

// ---------------- Marca ----------------
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = `c-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const bad = !HEX.test(value);
  return (
    <Field label={label} htmlFor={id} error={bad ? 'Usa el formato #RRGGBB' : null}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label} (selector)`} value={bad ? '#000000' : value} onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-control border border-line bg-surface p-1" />
        <input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={7} aria-invalid={bad || undefined}
          className="h-10 w-full rounded-control border border-line bg-surface px-3 font-mono text-sm uppercase text-fg focus:border-brand focus:outline-none focus:ring-2 focus:ring-ring aria-[invalid=true]:border-danger" />
      </div>
    </Field>
  );
}

function BrandTab({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const toast = useToast();
  const [primary, setPrimary] = useState((tenant.primary_color || '#0E7490').toUpperCase());
  const [secondary, setSecondary] = useState((tenant.secondary_color || '#F59E0B').toUpperCase());
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const logoSrc = preview ?? (tenant.logo_file_id ? `/api/files/${tenant.logo_file_id}` : null);
  const valid = HEX.test(primary) && HEX.test(secondary);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files?.[0];
    e.target.value = '';
    if (!fl) return;
    if (!LOGO_TYPES.includes(fl.type)) { toast.error('Formato no permitido. Usa PNG, JPG o WEBP.'); return; }
    if (fl.size > MAX_LOGO) { toast.error('El logo no debe superar 2 MB.'); return; }
    setFile(fl);
    setPreview(URL.createObjectURL(fl));
  }

  async function save() {
    if (!valid) { toast.error('Revisa los colores (formato #RRGGBB).'); return; }
    setSaving(true);
    try {
      let logoFileId: string | null = null;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('tenantId', tenant.id);
        logoFileId = (await api<{ id: string }>('/api/files', { form })).id;
      }
      await api(`/api/admin/tenants/${tenant.id}/branding`, {
        method: 'PUT', body: { primaryColor: primary.toUpperCase(), secondaryColor: secondary.toUpperCase(), logoFileId, clearLogo: false },
      });
      setFile(null);
      setPreview(null);
      toast.success('Marca actualizada.');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo guardar la marca.'));
    } finally {
      setSaving(false);
    }
  }

  async function clearLogo() {
    if (file) { setFile(null); setPreview(null); return; }
    if (!valid) { toast.error('Revisa los colores (formato #RRGGBB).'); return; }
    setClearing(true);
    try {
      await api(`/api/admin/tenants/${tenant.id}/branding`, {
        method: 'PUT', body: { primaryColor: primary.toUpperCase(), secondaryColor: secondary.toUpperCase(), logoFileId: null, clearLogo: true },
      });
      toast.success('Logo eliminado.');
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo quitar el logo.'));
    } finally {
      setClearing(false);
    }
  }

  const p = HEX.test(primary) ? primary : '#0E7490';
  const s = HEX.test(secondary) ? secondary : '#F59E0B';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Colores y logo</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField label="Color primario" value={primary} onChange={setPrimary} />
          <ColorField label="Color secundario" value={secondary} onChange={setSecondary} />
        </div>
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium">Logo</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-card border border-dashed border-line bg-surface-2">
              {logoSrc
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logoSrc} alt="Logo de la clínica" className="max-h-full max-w-full object-contain" />
                : <ImageOff className="size-8 text-subtle" aria-label="Sin logo" />}
            </div>
            <div className="flex flex-col gap-2">
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={pick} id="logo-input" />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={<Upload className="size-4" />} onClick={() => inputRef.current?.click()}>
                  {logoSrc ? 'Cambiar logo' : 'Subir logo'}
                </Button>
                {logoSrc && (
                  <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} loading={clearing} onClick={clearLogo}>
                    {file ? 'Descartar' : 'Quitar logo'}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">PNG, JPG o WEBP. Máximo 2 MB.{file && ' El logo se subirá al guardar.'}</p>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={save} loading={saving} disabled={!valid}>Guardar marca</Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">Vista previa</h2>
        <div className="overflow-hidden rounded-card border border-line">
          <div className="flex">
            <div className="w-40 shrink-0 space-y-1 border-r border-line bg-surface-2 p-3">
              <div className="mb-3 flex h-10 items-center">
                {logoSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoSrc} alt="" className="max-h-10 max-w-full object-contain" />
                  : <span className="truncate text-sm font-semibold">{tenant.trade_name}</span>}
              </div>
              <div className="rounded-control px-2 py-1.5 text-sm font-medium"
                style={{ backgroundColor: `color-mix(in srgb, ${p} 14%, transparent)`, color: p }}>Agenda</div>
              <div className="px-2 py-1.5 text-sm text-muted">Pacientes</div>
              <div className="px-2 py-1.5 text-sm text-muted">Presupuestos</div>
            </div>
            <div className="flex-1 space-y-3 p-4">
              <p className="text-sm font-medium">Botones</p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex h-9 items-center rounded-control px-3 text-sm font-medium text-white" style={{ backgroundColor: p }}>Guardar</span>
                <span className="inline-flex h-9 items-center rounded-control px-3 text-sm font-medium text-white" style={{ backgroundColor: s }}>Secundario</span>
              </div>
              <p className="text-sm">Enlace de ejemplo: <span className="font-medium underline" style={{ color: p }}>ver detalle</span></p>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ color: s, backgroundColor: `color-mix(in srgb, ${s} 14%, transparent)` }}>Etiqueta</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ---------------- Usuarios ----------------
function ConfirmModal({ open, title, children, confirmLabel, danger, loading, onConfirm, onClose }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; danger?: boolean; loading?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="text-sm">{children}</div>
    </Modal>
  );
}

function TempPasswordModal({ data, onClose }: { data: { email: string; tempPassword: string } | null; onClose: () => void }) {
  const toast = useToast();
  async function copy() {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.tempPassword); toast.success('Contraseña copiada.'); }
    catch { toast.error('No se pudo copiar. Cópiala manualmente.'); }
  }
  return (
    <Modal open={!!data} onClose={onClose} title="Contraseña temporal" size="sm" footer={<Button onClick={onClose}>Entendido</Button>}>
      {data && (
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-muted">Usuario</p>
            <p className="font-medium break-all">{data.email}</p>
          </div>
          <div>
            <p className="text-muted">Contraseña temporal</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded-control bg-surface-2 px-3 py-2 font-mono text-base break-all">{data.tempPassword}</code>
              <Button variant="secondary" size="sm" onClick={copy} icon={<Copy className="size-4" />}>Copiar</Button>
            </div>
          </div>
          <p className="flex gap-2 rounded-control bg-surface-2 p-3 text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>Se muestra una sola vez. El usuario deberá cambiarla en su primer ingreso.</span>
          </p>
        </div>
      )}
    </Modal>
  );
}

type UserForm = { mode: 'create' | 'edit'; id: string; email: string; fullName: string; roleCode: string; isActive: boolean };

function UsersTab({ tenantId, onChanged }: { tenantId: string; onChanged: () => void }) {
  const toast = useToast();
  const [data, setData] = useState<{ users: UserRow[]; roles: Role[]; usage: Usage } | null>(null);
  const [form, setForm] = useState<UserForm | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [temp, setTemp] = useState<{ email: string; tempPassword: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'reset' | 'delete' | 'mfa'; user: UserRow } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<{ users: UserRow[]; roles: Role[]; usage: Usage }>(`/api/admin/tenants/${tenantId}/users`));
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron cargar los usuarios.'));
      setData({ users: [], roles: [], usage: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);
  useEffect(() => { load(); }, [load]);

  const roles = (data?.roles ?? []).filter((r) => r.code !== 'SUPER_ADMIN');
  const roleOptions = roles.map((r) => ({ value: r.code, label: r.name }));
  const usage = data?.usage;
  const pct = usage && usage.max_users > 0 ? Math.min(100, Math.round((usage.active_users / usage.max_users) * 100)) : 0;
  const full = !!usage && usage.active_users >= usage.max_users;

  const openCreate = () => {
    setErrors({});
    setForm({ mode: 'create', id: crypto.randomUUID(), email: '', fullName: '', roleCode: roles.find((r) => r.code !== 'CLINIC_ADMIN')?.code ?? roles[0]?.code ?? '', isActive: true });
  };
  const openEdit = (u: UserRow) => {
    setErrors({});
    setForm({ mode: 'edit', id: u.id, email: u.email, fullName: u.full_name, roleCode: u.role_code, isActive: truthy(u.is_active) });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      if (form.mode === 'create') {
        const r = await api<{ id: string; email: string; tempPassword: string }>(`/api/admin/tenants/${tenantId}/users`, {
          body: { id: form.id, email: form.email, fullName: form.fullName, roleCode: form.roleCode },
        });
        setForm(null);
        setTemp({ email: r.email, tempPassword: r.tempPassword });
        toast.success('Usuario creado.');
      } else {
        await api(`/api/admin/tenants/${tenantId}/users/${form.id}`, {
          method: 'PUT', body: { fullName: form.fullName, roleCode: form.roleCode, isActive: form.isActive },
        });
        setForm(null);
        toast.success('Usuario actualizado.');
      }
      await load();
      onChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      // PLAN_USER_LIMIT y demás errores de negocio llegan con su mensaje
      toast.error(errMsg(err, 'No se pudo guardar el usuario.'));
    } finally {
      setSaving(false);
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'reset') {
        const r = await api<{ tempPassword: string }>(`/api/admin/tenants/${tenantId}/users/${confirm.user.id}/reset-password`, { method: 'POST' });
        setTemp({ email: confirm.user.email, tempPassword: r.tempPassword });
        toast.success('Contraseña restablecida.');
      } else if (confirm.kind === 'mfa') {
        await api(`/api/admin/tenants/${tenantId}/users/${confirm.user.id}/reset-mfa`, { method: 'POST' });
        toast.success('2FA restablecido.');
        await load();
      } else {
        await api(`/api/admin/tenants/${tenantId}/users/${confirm.user.id}`, { method: 'DELETE' });
        toast.success('Usuario eliminado.');
        await load();
        onChanged();
      }
      setConfirm(null);
    } catch (e) {
      toast.error(errMsg(e, 'No se pudo completar la acción.'));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Spinner />;

  return (
    <>
      <Card className="mb-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium">
              {usage ? `${usage.active_users} de ${usage.max_users} usuarios activos` : 'Uso no disponible'}
              {usage && <span className="font-normal text-muted"> · {usage.plan_name}</span>}
            </p>
            <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-surface-2" role="progressbar"
              aria-valuemin={0} aria-valuemax={usage?.max_users ?? 0} aria-valuenow={usage?.active_users ?? 0} aria-label="Usuarios activos">
              <div className={cx('h-full rounded-full transition-all', full ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
            </div>
            {full && <p className="mt-2 text-xs text-warning">Se alcanzó el límite del plan. Desactiva un usuario o amplía el límite en “Datos”.</p>}
          </div>
          <Button icon={<UserPlus className="size-4" />} onClick={openCreate}>Nuevo usuario</Button>
        </div>
      </Card>

      <Card>
        {data.users.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Sin usuarios" description="Crea el primer usuario de esta clínica." />
        ) : (
          <Table>
            <thead><tr><Th>Nombre</Th><Th>Correo</Th><Th>Rol</Th><Th>Estado</Th><Th>Último ingreso</Th><Th className="text-right">Acciones</Th></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <Td><span className="font-medium">{u.full_name}</span></Td>
                  <Td label="Correo"><span className="break-all">{u.email}</span></Td>
                  <Td label="Rol">{u.role_name}</Td>
                  <Td label="Estado">
                    <span className="flex flex-wrap gap-1">
                      {truthy(u.is_active) ? <Badge color="var(--success)">Activo</Badge> : <Badge>Inactivo</Badge>}
                      {truthy(u.must_change_password) && <Badge color="var(--warning)">Clave temporal</Badge>}
                    </span>
                  </Td>
                  <Td label="Último ingreso">{u.last_login_at ? formatDateTime(u.last_login_at) : 'Nunca'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" aria-label={`Editar ${u.full_name}`} title="Editar" onClick={() => openEdit(u)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="sm" aria-label={`Restablecer contraseña de ${u.full_name}`} title="Restablecer contraseña"
                        onClick={() => setConfirm({ kind: 'reset', user: u })}><KeyRound className="size-4" /></Button>
                      {!!u.totp_enabled && <Button variant="ghost" size="sm" aria-label={`Restablecer 2FA de ${u.full_name}`} title="Restablecer 2FA"
                        onClick={() => setConfirm({ kind: 'mfa', user: u })}><ShieldOff className="size-4" /></Button>}
                      <Button variant="ghost" size="sm" aria-label={`Eliminar ${u.full_name}`} title="Eliminar" className="text-danger"
                        onClick={() => setConfirm({ kind: 'delete', user: u })}><Trash2 className="size-4" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.mode === 'create' ? 'Nuevo usuario' : 'Editar usuario'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button type="submit" form="user-form" loading={saving}>{form?.mode === 'create' ? 'Crear usuario' : 'Guardar'}</Button></>}>
        {form && (
          <form id="user-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Input label="Correo" type="email" required className="sm:col-span-2" value={form.email} disabled={form.mode === 'edit'}
              onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} autoComplete="off" />
            <Input label="Nombre completo" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} />
            <Select label="Rol" required value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value })} error={errors.roleCode} options={roleOptions} />
            {form.mode === 'edit' && (
              <div className="sm:col-span-2">
                <Checkbox label="Usuario activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
              </div>
            )}
            {form.mode === 'create' && (
              <p className="text-xs text-muted sm:col-span-2">Se generará una contraseña temporal que se mostrará una sola vez.</p>
            )}
          </form>
        )}
      </Modal>

      <ConfirmModal open={confirm?.kind === 'reset'} title="Restablecer contraseña" confirmLabel="Restablecer" loading={busy}
        onConfirm={runConfirm} onClose={() => setConfirm(null)}>
        Se generará una nueva contraseña temporal para <strong>{confirm?.user.full_name}</strong> y deberá cambiarla en su próximo ingreso. ¿Continuar?
      </ConfirmModal>
      <ConfirmModal open={confirm?.kind === 'mfa'} title="Restablecer 2FA" confirmLabel="Restablecer" loading={busy}
        onConfirm={runConfirm} onClose={() => setConfirm(null)}>
        Se desactivará la verificación en dos pasos de <strong>{confirm?.user.full_name}</strong> y se cerrarán sus sesiones. Úsalo sólo si perdió su autenticador.
      </ConfirmModal>
      <ConfirmModal open={confirm?.kind === 'delete'} title="Eliminar usuario" confirmLabel="Eliminar" danger loading={busy}
        onConfirm={runConfirm} onClose={() => setConfirm(null)}>
        ¿Eliminar a <strong>{confirm?.user.full_name}</strong> ({confirm?.user.email})? Esta acción no se puede deshacer.
      </ConfirmModal>
      <TempPasswordModal data={temp} onClose={() => setTemp(null)} />
    </>
  );
}

// ---------------- Pagos ----------------
function DocLink({ id, text }: { id: string | null; text: string }) {
  if (!id) return <span className="text-xs text-warning">Falta</span>;
  return <a href={`/api/files/${id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"><FileText className="size-3.5" />{text}</a>;
}

type PayForm = {
  id: string; planId: string; amount: string; currencyCode: string; periodStart: string; periodEnd: string;
  paidAt: string; methodCode: string; statusCode: string; reference: string; notes: string;
  invoiceNumber: string; invoice: UploadedFile | null; receipt: UploadedFile | null;
};

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addYears(isoDate: string, years: number) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d)).toISOString().slice(0, 10);
}

/** Fin de un periodo de N meses que empieza en isoDate (inclusive). */
function addMonths(isoDate: string, months: number) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function PaymentsTab({ tenant, plans, onChanged }: { tenant: Tenant; plans: Plan[]; onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [form, setForm] = useState<PayForm | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api<Payment[]>(`/api/admin/payments?tenantId=${tenant.id}`));
    } catch (e) {
      toast.error(errMsg(e, 'No se pudieron cargar los pagos.'));
      setRows([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);
  useEffect(() => { load(); }, [load]);

  const planDefaults = (planId: string, start: string) => {
    const p = plans.find((x) => x.id === planId);
    return {
      amount: p ? String(p.price) : '',
      currencyCode: p?.currency_code ?? tenant.currency_code ?? 'PEN',
      periodEnd: addMonths(start, p?.billing_period_code === 'YEARLY' ? 12 : 1),
    };
  };

  const openNew = () => {
    // Si la suscripción sigue vigente, el nuevo periodo empieza el día siguiente a su fin
    const end = tenant.subscription_end?.slice(0, 10);
    const start = end && end >= todayIn() ? addDays(end, 1) : todayIn();
    setErrors({});
    setIsNew(true);
    setForm({
      id: crypto.randomUUID(), planId: tenant.plan_id, ...planDefaults(tenant.plan_id, start), periodStart: start,
      paidAt: todayIn(), methodCode: 'TRANSFER', statusCode: 'PAID', reference: '', notes: '',
      invoiceNumber: '', invoice: null, receipt: null,
    });
  };
  const openEdit = (p: Payment) => {
    setErrors({});
    setIsNew(false);
    setForm({
      id: p.id, planId: p.plan_id, amount: String(p.amount), currencyCode: p.currency_code, periodStart: p.period_start.slice(0, 10),
      periodEnd: p.period_end.slice(0, 10), paidAt: p.paid_at ? p.paid_at.slice(0, 10) : '', methodCode: p.method_code ?? '',
      statusCode: p.status_code, reference: p.reference ?? '', notes: p.notes ?? '',
      invoiceNumber: p.invoice_number ?? '',
      invoice: p.invoice_file_id ? { id: p.invoice_file_id, name: p.invoice_file_name ?? 'Factura' } : null,
      receipt: p.receipt_file_id ? { id: p.receipt_file_id, name: p.receipt_file_name ?? 'Comprobante' } : null,
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrors({});
    try {
      const { invoice, receipt, ...rest } = form;
      await api('/api/admin/payments', { body: { ...rest, tenantId: tenant.id, methodCode: form.methodCode || null, invoiceFileId: invoice?.id ?? null, receiptFileId: receipt?.id ?? null } });
      toast.success(isNew ? 'Pago registrado.' : 'Pago actualizado.');
      setForm(null);
      await load();
      onChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errMsg(err, 'No se pudo guardar el pago.'));
    } finally {
      setSaving(false);
    }
  }

  const planOptions = plans.filter((p) => truthy(p.is_active) || p.id === form?.planId).map((p) => ({ value: p.id, label: p.name }));
  const upd = (k: keyof PayForm) => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Contrato vigente hasta <span className="font-medium text-fg">{formatDate(tenant.subscription_end)}</span>. Los pagos no modifican la suscripción: sus fechas se definen con los contratos.</p>
        <Button icon={<Plus className="size-4" />} onClick={openNew}>Registrar pago</Button>
      </div>
      <Card>
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon={<CreditCard className="size-6" />} title="Sin pagos registrados" />
        ) : (
          <Table>
            <thead><tr><Th>Periodo</Th><Th>Plan</Th><Th>Monto</Th><Th>Pagado el</Th><Th>Método</Th><Th>Estado</Th><Th>Factura</Th><Th>Comprobante</Th><Th className="text-right">Acciones</Th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <Td><span className="font-medium">{formatDate(p.period_start.slice(0, 10))} – {formatDate(p.period_end.slice(0, 10))}</span></Td>
                  <Td label="Plan">{p.plan_name}</Td>
                  <Td label="Monto">{formatMoney(p.amount, p.currency_symbol || symbolFor(p.currency_code))}</Td>
                  <Td label="Pagado el">{p.paid_at ? formatDate(p.paid_at.slice(0, 10)) : '—'}</Td>
                  <Td label="Método">{p.method_name ?? '—'}</Td>
                  <Td label="Estado"><Badge color={p.status_color}>{p.status_name}</Badge></Td>
                  <Td label="Factura"><DocLink id={p.invoice_file_id} text={p.invoice_number || 'Ver'} /></Td>
                  <Td label="Comprobante"><DocLink id={p.receipt_file_id} text={p.reference || 'Ver'} /></Td>
                  <Td className="text-right">
                    <Button variant="ghost" size="sm" aria-label="Editar pago" title="Editar" onClick={() => openEdit(p)}><Pencil className="size-4" /></Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={isNew ? 'Registrar pago' : 'Editar pago'} size="lg"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button type="submit" form="payment-form" loading={saving}>Guardar</Button></>}>
        {form && (
          <form id="payment-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Select label="Plan" required value={form.planId} error={errors.planId} options={planOptions}
              onChange={(e) => {
                const planId = e.target.value;
                setForm((f) => (f ? { ...f, planId, ...(isNew ? planDefaults(planId, f.periodStart) : {}) } : f));
              }} />
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Input label="Monto" type="number" min={0} step="0.01" required value={form.amount} onChange={upd('amount')} error={errors.amount} />
              <Select label="Moneda" value={form.currencyCode} onChange={upd('currencyCode')} error={errors.currencyCode}
                options={[{ value: 'PEN', label: 'PEN' }, { value: 'USD', label: 'USD' }]} />
            </div>
            <Input label="Inicio del periodo" type="date" required value={form.periodStart} onChange={upd('periodStart')} error={errors.periodStart} />
            <Input label="Fin del periodo" type="date" required value={form.periodEnd} onChange={upd('periodEnd')} error={errors.periodEnd} />
            <Select label="Estado" required value={form.statusCode} onChange={upd('statusCode')} error={errors.statusCode} options={PAY_STATUS_OPTIONS} />
            <Input label="Fecha de pago" type="date" value={form.paidAt} onChange={upd('paidAt')} error={errors.paidAt} />
            <Select label="Método" value={form.methodCode} onChange={upd('methodCode')} error={errors.methodCode} options={METHOD_OPTIONS} placeholder="—" />
            <Input label="Referencia / N° de operación" value={form.reference} onChange={upd('reference')} error={errors.reference} maxLength={120} />
            <div className="sm:col-span-2 grid gap-4 rounded-card border border-line bg-surface-2/50 p-4 sm:grid-cols-3">
              <p className="text-sm font-semibold sm:col-span-3">Documentos {form.statusCode === 'PAID' && <span className="font-normal text-muted">· obligatorios para un pago “Pagado”</span>}</p>
              <Input label="N° de factura" required={form.statusCode === 'PAID'} value={form.invoiceNumber} onChange={upd('invoiceNumber')} error={errors.invoiceNumber} maxLength={40} placeholder="F001-00001234" />
              <DocumentUpload label="Factura emitida" kind="INVOICE" required={form.statusCode === 'PAID'} value={form.invoice} error={errors.invoiceFileId}
                onChange={(v) => setForm((x) => (x ? { ...x, invoice: v } : x))} />
              <DocumentUpload label="Comprobante o evidencia de pago" kind="PAYMENT_PROOF" required={form.statusCode === 'PAID'} value={form.receipt} error={errors.receiptFileId}
                onChange={(v) => setForm((x) => (x ? { ...x, receipt: v } : x))} />
            </div>
            <Textarea label="Notas" className="sm:col-span-2" value={form.notes} onChange={upd('notes')} error={errors.notes} maxLength={500} />
          </form>
        )}
      </Modal>
    </>
  );
}
