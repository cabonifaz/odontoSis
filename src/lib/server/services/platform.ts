import 'server-only';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { callSp, spOne, spRows } from '../db';
import { hashPassword, temporaryPassword } from '../password';
import type {
  brandingSchema, contractSchema, paymentSchema, planSchema, requestCreateSchema, requestUpdateSchema, tenantCreateSchema, tenantUpdateSchema,
} from '@/lib/shared/schemas';

type Actor = { userId: string; ip: string | null };

export const listPlans = () => spRows('sp_plan_list');

export const savePlan = (a: Actor, p: z.infer<typeof planSchema>) =>
  callSp('sp_plan_save', [a.userId, a.ip, p.id, p.code, p.name, p.description, p.maxUsers, p.maxPatients, p.maxStorageMb,
    p.price, p.currencyCode, p.periodCode, p.isActive, p.maxBranches]);

export const listTenants = (search?: string | null) => spRows('sp_tenant_list', [search ?? null]);
export const getTenant = (id: string) => spOne('sp_tenant_get', [id]);
export const platformDashboard = async () => {
  const [kpis, expiring] = await callSp('sp_platform_dashboard');
  return { kpis: kpis[0], expiring };
};

/** Crea clínica + admin. Devuelve la contraseña temporal (se muestra UNA vez). */
export async function createTenant(a: Actor, t: z.infer<typeof tenantCreateSchema>) {
  const id = randomUUID();
  const tempPassword = temporaryPassword();
  await callSp('sp_tenant_create', [a.userId, a.ip, id, t.code, t.legalName, t.tradeName, t.taxId, t.email, t.phone, t.address,
    t.planId, t.statusCode, t.maxUsersOverride, t.primaryColor, t.secondaryColor, t.currencyCode, t.timezone,
    t.implementationStart, t.implementationEnd, t.implementationMaxPatients,
    randomUUID(), t.adminEmail, t.adminName, await hashPassword(tempPassword)]);
  return { id, adminEmail: t.adminEmail, tempPassword };
}

export const updateTenant = (a: Actor, id: string, t: z.infer<typeof tenantUpdateSchema>) =>
  callSp('sp_tenant_update', [a.userId, a.ip, id, t.legalName, t.tradeName, t.taxId, t.email, t.phone, t.address, t.planId,
    t.statusCode, t.maxUsersOverride, t.currencyCode, t.timezone, t.implementationStart, t.implementationEnd, t.implementationMaxPatients,
    t.maxBranchesOverride ?? null]);

export const setBranding = (a: Actor, tenantId: string, b: z.infer<typeof brandingSchema>) =>
  callSp('sp_tenant_branding_set', [a.userId, a.ip, tenantId, b.primaryColor, b.secondaryColor, b.logoFileId, b.clearLogo]);

export const listPayments = (tenantId: string | null) => spRows('sp_tenant_payment_list', [tenantId]);

export const savePayment = (a: Actor, p: z.infer<typeof paymentSchema>) =>
  callSp('sp_tenant_payment_save', [a.userId, a.ip, p.id, p.tenantId, p.planId, p.amount, p.currencyCode, p.periodStart,
    p.periodEnd, p.paidAt ? `${p.paidAt} 12:00:00` : null, p.methodCode ?? null, p.statusCode, p.reference, p.notes,
    p.invoiceNumber, p.invoiceFileId, p.receiptFileId]);

// ---------------- Contratos de suscripción ----------------
export const listContracts = (tenantId: string) => spRows('sp_tenant_contract_list', [tenantId]);
export const saveContract = (a: Actor, tenantId: string, c: z.infer<typeof contractSchema>) =>
  callSp('sp_tenant_contract_save', [a.userId, a.ip, c.id, tenantId, c.contractNumber, c.startDate, c.endDate, c.fileId, c.signedAt, c.notes]);
export const deleteContract = (a: Actor, tenantId: string, id: string) => callSp('sp_tenant_contract_delete', [a.userId, a.ip, tenantId, id]);

// ---------------- Solicitudes de mejora / soporte ----------------
/** tenantId null = todas (super admin) */
export const listRequests = (tenantId: string | null, status?: string | null) => spRows('sp_tenant_request_list', [tenantId, status ?? null]);
export const createRequest = (tenantId: string, a: Actor, r: z.infer<typeof requestCreateSchema>) =>
  callSp('sp_tenant_request_create', [tenantId, a.userId, a.ip, r.id, r.typeCode, r.title, r.description]);
export const updateRequest = (a: Actor, id: string, r: z.infer<typeof requestUpdateSchema>) =>
  callSp('sp_tenant_request_update', [a.userId, a.ip, id, r.statusCode, r.response]);

// ---------------- Ampliación del periodo de implementación ----------------
export const extendImplementation = (a: Actor, tenantId: string, newEnd: string, reason: string) =>
  callSp('sp_tenant_implementation_extend', [a.userId, a.ip, tenantId, newEnd, reason]);
export const implementationHistory = (tenantId: string) => spRows('sp_tenant_implementation_history', [tenantId]);
