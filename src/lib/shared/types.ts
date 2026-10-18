export type TenantBranding = {
  id: string;
  code: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
  logoFileId: string | null;
  timezone: string;
  status: string;
  currencyCode: string;
  currencySymbol: string;
  budgetValidityDays: number;
  /** Ficha de paciente de la clínica (cada sede puede sobrescribirla) */
  patientFormMode: 'STANDARD' | 'ADVANCED';
  /** Fase de acceso calculada (ver tenantAccess) */
  access: TenantAccess;
};

export type TenantPhase = 'IMPLEMENTATION' | 'PRODUCTION' | 'BLOCKED';
export type TenantAccess = {
  phase: TenantPhase;
  /** Motivo del bloqueo: SUSPENDED | CANCELLED | NO_CONTRACT | CONTRACT_NOT_STARTED | CONTRACT_EXPIRED | IMPLEMENTATION_NOT_STARTED | IMPLEMENTATION_ENDED */
  reason: string | null;
  /** Días que quedan de implementación o de contrato */
  daysLeft: number | null;
  until: string | null;
  from: string | null;
};

/**
 * Regla de acceso de una clínica (today = fecha local de la clínica, YYYY-MM-DD):
 *  - Suspendida / cancelada: sin acceso.
 *  - Implementación: sólo dentro del periodo de implementación (ampliable por el super admin).
 *  - Activa (producción): sólo con contrato vigente (inicio/fin oficial derivado de los contratos).
 */
export function tenantAccess(t: { status: string; subscriptionStart: string | null; subscriptionEnd: string | null; implementationStart: string | null; implementationEnd: string | null }, today: string): TenantAccess {
  const d = (v: string | null) => (v ? v.slice(0, 10) : null);
  const days = (to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86_400_000);
  const blocked = (reason: string, from: string | null = null, until: string | null = null): TenantAccess => ({ phase: 'BLOCKED', reason, daysLeft: null, from, until });
  if (t.status === 'SUSPENDED' || t.status === 'CANCELLED') return blocked(t.status);
  if (t.status === 'IMPLEMENTATION' || t.status === 'TRIAL') {
    const from = d(t.implementationStart), until = d(t.implementationEnd);
    if (!from || !until) return blocked('IMPLEMENTATION_NOT_STARTED');
    if (today < from) return blocked('IMPLEMENTATION_NOT_STARTED', from, until);
    if (today > until) return blocked('IMPLEMENTATION_ENDED', from, until);
    return { phase: 'IMPLEMENTATION', reason: null, daysLeft: days(until), from, until };
  }
  const from = d(t.subscriptionStart), until = d(t.subscriptionEnd);
  if (!from || !until) return blocked('NO_CONTRACT');
  if (today < from) return blocked('CONTRACT_NOT_STARTED', from, until);
  if (today > until) return blocked('CONTRACT_EXPIRED', from, until);
  return { phase: 'PRODUCTION', reason: null, daysLeft: days(until), from, until };
}

export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string;
  fullName: string;
  nickname: string | null;
  avatar: string | null;
  birthDate: string | null;
  roleCode: string;
  roleName: string;
  permissions: string[];
  isPlatform: boolean;
  mustChangePassword: boolean;
  totpEnabled: boolean;
  mfaVerified: boolean;
  doctorId: string | null;
  tenant: TenantBranding | null;
};

/** Datos de sesión seguros para enviar al cliente. */
export type ClientSession = Pick<SessionUser, 'userId' | 'email' | 'fullName' | 'nickname' | 'avatar' | 'birthDate' | 'roleCode' | 'roleName' | 'permissions' | 'isPlatform' | 'doctorId' | 'tenant'>;

export type MasterItem = {
  id: string;
  table_code: string;
  code: string;
  name: string;
  value: string | null;
  sort_order: number;
  is_active: number;
};

export const PERMISSIONS = {
  patientsRead: 'patients.read',
  patientsWrite: 'patients.write',
  budgetsRead: 'budgets.read',
  budgetsWrite: 'budgets.write',
  budgetsEdit: 'budgets.edit',
  appointmentsRead: 'appointments.read',
  appointmentsWrite: 'appointments.write',
  doctorsRead: 'doctors.read',
  doctorsWrite: 'doctors.write',
  servicesRead: 'services.read',
  servicesWrite: 'services.write',
  usersManage: 'users.manage',
  settingsManage: 'settings.manage',
  catalogsManage: 'catalogs.manage',
  platform: 'platform.*',
} as const;

export type PermissionOverrides = { grant: string[]; deny: string[] };

/** Permisos que el administrador de la clínica puede otorgar/quitar por usuario (además del rol). */
export const USER_GRANTABLE_PERMISSIONS = [
  { code: 'budgets.edit', label: 'Puede editar presupuestos emitidos', hint: 'Modificar tratamientos, precios, estado o eliminar un presupuesto ya guardado' },
] as const;

/** Permisos efectivos = rol + grant - deny (sólo permisos otorgables por usuario) */
export function effectivePermissions(rolePerms: string[], overrides: PermissionOverrides | null | undefined): string[] {
  const allowed = new Set<string>(USER_GRANTABLE_PERMISSIONS.map((p) => p.code));
  const set = new Set(rolePerms);
  for (const p of overrides?.grant ?? []) if (allowed.has(p)) set.add(p);
  for (const p of overrides?.deny ?? []) if (allowed.has(p)) set.delete(p);
  return [...set];
}

export const can = (perms: string[] | undefined, p: string) => !!perms && (perms.includes(p) || perms.includes('platform.*'));
