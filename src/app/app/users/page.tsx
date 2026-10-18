'use client';
import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';
import { useApp } from '@/lib/client/app-context';
import { TempPasswordModal } from '@/components/users/temp-password-modal';
import { DocumentNumberInput } from '@/components/dni-lookup';
import { UserAvatar } from '@/components/avatar';
import { formatDateTime } from '@/lib/shared/format';
import { effectivePermissions, USER_GRANTABLE_PERMISSIONS, type PermissionOverrides } from '@/lib/shared/types';

type U = { id: string; email: string; full_name: string; nickname: string | null; avatar: string | null; is_active: number; totp_enabled: number; last_login_at: string | null; locked_until: string | null; role_code: string; role_name: string; role_permissions: string[]; permission_overrides: PermissionOverrides | null };
type Role = { id: string; code: string; name: string; permissions: string[] };
type Usage = { plan_name: string; max_users: number; active_users: number };
type Form = { id: string; email: string; fullName: string; roleCode: string; isActive: boolean; isNew: boolean; perms: Record<string, boolean> };

/** Permisos efectivos (otorgables) de un usuario a partir de su rol y excepciones */
const userPerms = (rolePerms: string[], ov: PermissionOverrides | null) => {
  const eff = effectivePermissions(rolePerms ?? [], ov);
  return Object.fromEntries(USER_GRANTABLE_PERMISSIONS.map((p) => [p.code, eff.includes(p.code)]));
};
/** Excepciones = diferencias entre lo marcado y lo que da el rol */
const toOverrides = (rolePerms: string[], perms: Record<string, boolean>): PermissionOverrides => ({
  grant: Object.keys(perms).filter((k) => perms[k] && !rolePerms.includes(k)),
  deny: Object.keys(perms).filter((k) => !perms[k] && rolePerms.includes(k)),
});

export default function UsersPage() {
  const { session } = useApp();
  const toast = useToast();
  const [data, setData] = useState<{ users: U[]; roles: Role[]; usage: Usage } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dni, setDni] = useState('');
  const [temp, setTemp] = useState<{ email: string; tempPassword: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete' | 'reset'; u: U } | null>(null);

  const load = useCallback(() => { api<typeof data>('/api/users').then(setData); }, []);
  useEffect(load, [load]);

  const rolePermsOf = (code: string) => data?.roles.find((r) => r.code === code)?.permissions ?? [];

  async function save() {
    if (!form) return;
    setSaving(true);
    const permissionOverrides = toOverrides(rolePermsOf(form.roleCode), form.perms);
    try {
      if (form.isNew) {
        const r = await api<{ email: string; tempPassword: string }>('/api/users', { body: { id: form.id, email: form.email, fullName: form.fullName, roleCode: form.roleCode, permissionOverrides } });
        setTemp(r);
      } else {
        await api(`/api/users/${form.id}`, { method: 'PUT', body: { fullName: form.fullName, roleCode: form.roleCode, isActive: form.isActive, permissionOverrides } });
        toast.success('Usuario actualizado.');
      }
      setForm(null);
      load();
    } catch (e) {
      setErrors(fieldErrors(e));
      toast.error(e instanceof ApiError ? e.message : 'Error');
    } finally { setSaving(false); }
  }

  async function runConfirm() {
    if (!confirm) return;
    try {
      if (confirm.kind === 'delete') {
        await api(`/api/users/${confirm.u.id}`, { method: 'DELETE' });
        toast.success('Usuario eliminado.');
      } else {
        const r = await api<{ tempPassword: string }>(`/api/users/${confirm.u.id}/reset-password`, { method: 'POST' });
        setTemp({ email: confirm.u.email, tempPassword: r.tempPassword });
      }
      setConfirm(null);
      load();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Error'); }
  }

  const full = data ? data.usage.active_users >= data.usage.max_users : false;
  return (
    <>
      <PageHeader title="Usuarios" subtitle="Accesos al sistema de la clínica."
        actions={<Button icon={<Plus className="size-4" />} disabled={!data || full} title={full ? 'Límite del plan alcanzado' : undefined}
          onClick={() => { setErrors({}); setForm({ id: crypto.randomUUID(), email: '', fullName: '', roleCode: 'RECEPTIONIST', isActive: true, isNew: true, perms: userPerms(rolePermsOf('RECEPTIONIST'), null) }); }}>Nuevo usuario</Button>} />
      {data && (
        <Card className="mb-4 p-4">
          <div className="flex items-center justify-between text-sm">
            <span>Plan <strong>{data.usage.plan_name}</strong></span>
            <span className={full ? 'font-medium text-warning' : 'text-muted'}>{data.usage.active_users} de {data.usage.max_users} usuarios activos</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={data.usage.active_users} aria-valuemax={data.usage.max_users}>
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, (data.usage.active_users / data.usage.max_users) * 100)}%` }} />
          </div>
          {full && <p className="mt-2 text-xs text-muted">Para agregar más usuarios, desactiva uno existente o solicita una ampliación del plan.</p>}
        </Card>
      )}
      <Card>
        {!data ? <Spinner /> : data.users.length === 0 ? <EmptyState icon={<UserCog className="size-6" />} title="Sin usuarios" /> : (
          <Table>
            <thead><tr><Th>Nombre</Th><Th>Rol</Th><Th>Estado</Th><Th>Último ingreso</Th><Th /></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <Td label="Nombre">
                    <span className="flex items-center gap-2.5">
                      <UserAvatar avatar={u.avatar} name={u.full_name} size={32} />
                      <span><p className="font-medium">{u.full_name}{u.nickname ? <span className="font-normal text-muted"> · “{u.nickname}”</span> : null}</p><p className="text-xs text-muted">{u.email}</p></span>
                    </span>
                  </Td>
                  <Td label="Rol">{u.role_name}</Td>
                  <Td label="Estado">
                    <span className="flex flex-wrap gap-1">
                      {u.is_active ? <Badge color="var(--success)">Activo</Badge> : <Badge>Inactivo</Badge>}
                      {!!u.totp_enabled && <Badge color="var(--info)"><ShieldCheck className="size-3" />2FA</Badge>}
                      {effectivePermissions(u.role_permissions ?? [], u.permission_overrides).includes('budgets.edit')
                        ? <Badge color="var(--brand)">Edita presupuestos</Badge> : <Badge>Sin editar presupuestos</Badge>}
                    </span>
                  </Td>
                  <Td label="Último ingreso">{formatDateTime(u.last_login_at, session.tenant?.timezone)}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" aria-label="Editar" onClick={() => { setErrors({}); setForm({ id: u.id, email: u.email, fullName: u.full_name, roleCode: u.role_code, isActive: !!u.is_active, isNew: false, perms: userPerms(u.role_permissions, u.permission_overrides) }); }}><Pencil className="size-4" /></Button>
                    <Button size="sm" variant="ghost" aria-label="Restablecer contraseña" onClick={() => setConfirm({ kind: 'reset', u })}><KeyRound className="size-4" /></Button>
                    {u.id !== session.userId && <Button size="sm" variant="ghost" aria-label="Eliminar" className="text-danger" onClick={() => setConfirm({ kind: 'delete', u })}><Trash2 className="size-4" /></Button>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.isNew ? 'Nuevo usuario' : 'Editar usuario'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save} loading={saving}>{form?.isNew ? 'Crear usuario' : 'Guardar'}</Button></>}>
        {form && data && (
          <div className="grid gap-4">
            <Input label="Correo" type="email" required disabled={!form.isNew} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
            {form.isNew && (
              <DocumentNumberInput label="DNI (para traer el nombre de RENIEC)" isDni value={dni} onChange={setDni}
                onFound={(r) => setForm({ ...form, fullName: r.fullName })} />
            )}
            <Input label="Nombre completo" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} error={errors.fullName} />
            <Select label="Rol" value={form.roleCode} onChange={(e) => setForm({ ...form, roleCode: e.target.value, perms: userPerms(rolePermsOf(e.target.value), null) })} options={data.roles.map((r) => ({ value: r.code, label: r.name }))} />
            <fieldset className="rounded-control border border-line p-3">
              <legend className="px-1 text-sm font-medium">Permisos adicionales</legend>
              {USER_GRANTABLE_PERMISSIONS.map((p) => {
                const fromRole = rolePermsOf(form.roleCode).includes(p.code);
                return (
                  <div key={p.code} className="space-y-0.5">
                    <Checkbox label={p.label} checked={!!form.perms[p.code]} onChange={(v) => setForm({ ...form, perms: { ...form.perms, [p.code]: v } })} />
                    <p className="pl-6 text-xs text-muted">{p.hint}. {fromRole ? 'Incluido por defecto en el rol.' : 'No incluido en el rol.'}</p>
                  </div>
                );
              })}
            </fieldset>
            {!form.isNew && form.id !== session.userId && <Checkbox label="Usuario activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />}
            {form.isNew && <p className="text-xs text-muted">Se generará una contraseña temporal que el usuario deberá cambiar al ingresar.</p>}
          </div>
        )}
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'delete' ? 'Eliminar usuario' : 'Restablecer contraseña'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button><Button variant={confirm?.kind === 'delete' ? 'danger' : 'primary'} onClick={runConfirm}>Confirmar</Button></>}>
        <p className="text-sm">{confirm?.kind === 'delete' ? `¿Eliminar el acceso de ${confirm?.u.full_name}? Se cerrarán sus sesiones.` : `Se generará una nueva contraseña temporal para ${confirm?.u.full_name} y se cerrarán sus sesiones.`}</p>
      </Modal>
      <TempPasswordModal data={temp} onClose={() => setTemp(null)} />
    </>
  );
}
