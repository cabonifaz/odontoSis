'use client';
import { useCallback, useEffect, useState } from 'react';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Input, Modal, PageHeader, Spinner, Tabs, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/client/api';
import { useApp } from '@/lib/client/app-context';
import { formatDate } from '@/lib/shared/format';
import { TenantLoginLink } from '@/components/tenant-login-link';
import { BranchesTab } from '@/components/settings/branches-tab';

type Tenant = { trade_name: string; legal_name: string; tax_id: string | null; email: string | null; phone: string | null; address: string | null; budget_validity_days: number; budget_notes: string | null; primary_color: string; secondary_color: string; logo_file_id: string | null; plan_name: string; subscription_end: string | null };
type Usage = { plan_name: string; max_users: number; active_users: number; max_patients: number | null; patients: number; max_storage_mb: number; storage_bytes: number; subscription_start: string | null; subscription_end: string | null; implementation_start: string | null; implementation_end: string | null; implementation_max_patients: number | null; status_code: string };
type Tab = 'clinica' | 'sedes' | 'marca' | 'catalogos' | 'plan';

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('clinica');
  const [data, setData] = useState<{ tenant: Tenant; usage: Usage } | null>(null);
  const load = useCallback(() => { api<{ tenant: Tenant; usage: Usage }>('/api/settings').then(setData); }, []);
  useEffect(load, [load]);
  return (
    <>
      <PageHeader title="Configuración" subtitle="Datos de la clínica, marca y catálogos." />
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'clinica', label: 'Clínica' }, { value: 'sedes', label: 'Sedes' }, { value: 'marca', label: 'Marca' }, { value: 'catalogos', label: 'Catálogos' }, { value: 'plan', label: 'Plan' }]} />
      {!data ? <Spinner /> : (
        <>
          {tab === 'clinica' && <ClinicForm t={data.tenant} onSaved={load} />}
          {tab === 'sedes' && <BranchesTab readOnly />}
          {tab === 'marca' && <BrandingForm t={data.tenant} />}
          {tab === 'catalogos' && <Catalogs />}
          {tab === 'plan' && <PlanUsage u={data.usage} />}
        </>
      )}
    </>
  );
}

function ClinicForm({ t, onSaved }: { t: Tenant; onSaved: () => void }) {
  const toast = useToast();
  const { session } = useApp();
  const [v, setV] = useState({ tradeName: t.trade_name, email: t.email ?? '', phone: t.phone ?? '', address: t.address ?? '', budgetValidityDays: String(t.budget_validity_days), budgetNotes: t.budget_notes ?? '' });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await api('/api/settings', { method: 'PUT', body: v }); toast.success('Datos guardados.'); onSaved(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
    finally { setSaving(false); }
  }
  return (
    <>
    <div className="max-w-3xl"><TenantLoginLink code={session.tenant!.code} /></div>
    <Card className="max-w-3xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre comercial" value={v.tradeName} onChange={(e) => setV({ ...v, tradeName: e.target.value })} className="sm:col-span-2" />
        <Input label="Razón social" value={t.legal_name} disabled hint="Lo gestiona el administrador de la plataforma" />
        <Input label="RUC" value={t.tax_id ?? ''} disabled />
        <Input label="Correo" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <Input label="Teléfono" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        <Input label="Dirección" value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} className="sm:col-span-2" />
        <Input label="Validez del presupuesto (días)" type="number" min="1" max="365" value={v.budgetValidityDays} onChange={(e) => setV({ ...v, budgetValidityDays: e.target.value })} />
        <Textarea label="Notas al pie del presupuesto" hint="Una nota por línea" rows={5} value={v.budgetNotes} onChange={(e) => setV({ ...v, budgetNotes: e.target.value })} className="sm:col-span-2" />
      </div>
      <div className="mt-6 flex justify-end"><Button onClick={save} loading={saving}>Guardar</Button></div>
    </Card>
    </>
  );
}

function BrandingForm({ t }: { t: Tenant }) {
  const toast = useToast();
  const [primary, setPrimary] = useState(t.primary_color);
  const [secondary, setSecondary] = useState(t.secondary_color);
  const [logo, setLogo] = useState<string | null>(t.logo_file_id);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) { toast.error('El logo debe pesar máximo 2 MB.'); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api<{ id: string }>('/api/files', { form });
      setLogo(r.id);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
    finally { setUploading(false); }
  }
  async function save() {
    setSaving(true);
    try {
      await api('/api/settings/branding', { method: 'PUT', body: { primaryColor: primary.toUpperCase(), secondaryColor: secondary.toUpperCase(), logoFileId: logo, clearLogo: !logo } });
      toast.success('Marca actualizada.');
      window.location.reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); setSaving(false); }
  }
  return (
    <Card className="max-w-3xl p-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <ColorField label="Color principal" value={primary} onChange={setPrimary} />
          <ColorField label="Color secundario" value={secondary} onChange={setSecondary} />
          <div>
            <p className="mb-1.5 text-sm font-medium">Logo</p>
            <div className="flex items-center gap-3">
              <div className="grid size-16 place-items-center overflow-hidden rounded-lg border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logo ? <img src={`/api/files/${logo}`} alt="Logo" className="size-full object-contain" /> : <ImagePlus className="size-6 text-subtle" />}
              </div>
              <label className="inline-flex h-9 cursor-pointer items-center rounded-control border border-line px-3 text-sm hover:bg-surface-2">
                {uploading ? 'Subiendo…' : 'Subir imagen'}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {logo && <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>Quitar</Button>}
            </div>
            <p className="mt-1 text-xs text-muted">PNG, JPG o WEBP · máx. 2 MB</p>
          </div>
        </div>
        <div className="rounded-card border border-line p-4" aria-label="Vista previa">
          <p className="mb-3 text-xs font-medium uppercase text-muted">Vista previa</p>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-control px-3 py-2 text-sm font-medium" style={{ backgroundColor: `color-mix(in srgb, ${primary} 12%, transparent)`, color: primary }}>● Menú activo</div>
            <button type="button" className="h-10 rounded-control px-4 text-sm font-medium text-white" style={{ backgroundColor: primary }}>Botón principal</button>
            <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in srgb, ${secondary} 18%, transparent)`, color: secondary }}>Acento</span>
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end"><Button onClick={save} loading={saving}>Guardar marca</Button></div>
    </Card>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-end gap-2">
      <input aria-label={label} type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 cursor-pointer rounded-control border border-line bg-surface" />
      <Input label={label} value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9A-Fa-f]{6}" className="flex-1" />
    </div>
  );
}

type MI = { id: string; table_code: string; code: string; name: string; value: string | null; sort_order: number; is_active: number; is_system: number; tenant_id: string | null };
const EDITABLE = [{ code: 'SPECIALTY', name: 'Especialidades' }, { code: 'SERVICE_CATEGORY', name: 'Categorías de servicio' }];

function Catalogs() {
  const toast = useToast();
  const { syncNow } = useApp();
  const [table, setTable] = useState(EDITABLE[0].code);
  const [items, setItems] = useState<MI[] | null>(null);
  const [form, setForm] = useState<{ id: string; code: string; name: string; sortOrder: string; isActive: boolean } | null>(null);
  const load = useCallback(() => { setItems(null); api<MI[]>(`/api/masters?table=${table}&all=1`).then(setItems); }, [table]);
  useEffect(load, [load]);

  async function save() {
    if (!form) return;
    try {
      await api('/api/masters', { body: { id: form.id, tableCode: table, code: form.code, name: form.name, sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive } });
      toast.success('Guardado.');
      setForm(null); load(); void syncNow();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }
  async function remove(id: string) {
    try { await api(`/api/masters/${id}`, { method: 'DELETE' }); load(); void syncNow(); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  return (
    <Card className="max-w-3xl">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          {EDITABLE.map((t) => <Button key={t.code} size="sm" variant={table === t.code ? 'primary' : 'secondary'} onClick={() => setTable(t.code)}>{t.name}</Button>)}
        </div>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setForm({ id: crypto.randomUUID(), code: '', name: '', sortOrder: '100', isActive: true })}>Agregar</Button>
      </div>
      {!items ? <Spinner /> : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-24 font-mono text-xs text-muted">{i.code}</span>
              <span className="flex-1">{i.name}</span>
              {i.tenant_id === null ? <Badge>Sistema</Badge> : <>
                {!i.is_active && <Badge>Inactivo</Badge>}
                <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => setForm({ id: i.id, code: i.code, name: i.name, sortOrder: String(i.sort_order), isActive: !!i.is_active })}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" aria-label="Eliminar" className="text-danger" onClick={() => remove(i.id)}><Trash2 className="size-4" /></Button>
              </>}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!form} onClose={() => setForm(null)} title="Ítem de catálogo" size="sm"
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Guardar</Button></>}>
        {form && (
          <div className="grid gap-4">
            <Input label="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            <Input label="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input label="Orden" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            <Checkbox label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
          </div>
        )}
      </Modal>
    </Card>
  );
}

function PlanUsage({ u }: { u: Usage }) {
  const bar = (used: number, max: number | null) => (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand" style={{ width: max ? `${Math.min(100, (used / max) * 100)}%` : '4%' }} /></div>
  );
  const mb = u.storage_bytes / 1024 / 1024;
  return (
    <Card className="max-w-3xl space-y-6 p-6 text-sm">
      <p>Plan actual: <strong>{u.plan_name}</strong></p>
      {u.status_code === 'IMPLEMENTATION' ? (
        <p className="rounded-control border border-accent/40 bg-accent/10 p-3">Periodo de implementación del <strong>{formatDate(u.implementation_start?.slice(0, 10))}</strong> al <strong>{formatDate(u.implementation_end?.slice(0, 10))}</strong>{u.implementation_max_patients ? <> · máximo {u.implementation_max_patients} pacientes durante la implementación</> : null}. Los presupuestos impresos llevan marca de agua.</p>
      ) : (
        <p>Suscripción oficial (según contrato): <strong>{formatDate(u.subscription_start?.slice(0, 10))}</strong> – <strong>{formatDate(u.subscription_end?.slice(0, 10))}</strong></p>
      )}
      <div><p className="flex justify-between"><span>Usuarios activos</span><span>{u.active_users} / {u.max_users}</span></p>{bar(u.active_users, u.max_users)}</div>
      <div><p className="flex justify-between"><span>Pacientes</span><span>{u.patients} / {u.max_patients ?? 'ilimitado'}</span></p>{bar(u.patients, u.max_patients)}</div>
      <div><p className="flex justify-between"><span>Almacenamiento</span><span>{mb.toFixed(1)} MB / {u.max_storage_mb} MB</span></p>{bar(mb, u.max_storage_mb)}</div>
    </Card>
  );
}
