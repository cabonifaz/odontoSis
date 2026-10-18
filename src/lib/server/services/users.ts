import 'server-only';
import type { z } from 'zod';
import { callSp, spRows, spOne } from '../db';
import { hashPassword, temporaryPassword } from '../password';
import type { userCreateSchema, userUpdateSchema } from '@/lib/shared/schemas';

type Actor = { userId: string; ip: string | null };

/** tenantId null = usuarios de plataforma (super admin) */
export const listUsers = (tenantId: string | null) => spRows('sp_user_list', [tenantId]);
export const listRoles = (tenantId: string | null) => spRows('sp_role_list', [tenantId]);
export const tenantUsage = (tenantId: string) => spOne('sp_tenant_usage', [tenantId]);

export async function createUser(tenantId: string | null, a: Actor, u: z.infer<typeof userCreateSchema>) {
  const tempPassword = temporaryPassword();
  await callSp('sp_user_create', [tenantId, a.userId, a.ip, u.id, u.email, u.fullName, u.roleCode, await hashPassword(tempPassword),
    u.permissionOverrides ? JSON.stringify(u.permissionOverrides) : null]);
  return { id: u.id, email: u.email, tempPassword };
}

export const updateUser = (tenantId: string | null, a: Actor, id: string, u: z.infer<typeof userUpdateSchema>) =>
  callSp('sp_user_update', [tenantId, a.userId, a.ip, id, u.fullName, u.roleCode, u.isActive,
    u.permissionOverrides ? JSON.stringify(u.permissionOverrides) : null]);

export const deleteUser = (tenantId: string | null, a: Actor, id: string) =>
  callSp('sp_user_delete', [tenantId, a.userId, a.ip, id]);

export async function resetUserPassword(tenantId: string | null, a: Actor, id: string) {
  const tempPassword = temporaryPassword();
  await callSp('sp_user_reset_password', [tenantId, a.userId, a.ip, id, await hashPassword(tempPassword)]);
  return { tempPassword };
}
