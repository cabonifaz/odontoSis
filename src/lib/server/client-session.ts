import 'server-only';
import type { ClientSession, SessionUser } from '@/lib/shared/types';

/** Sólo lo necesario para la UI (sin ids de sesión ni flags de seguridad). */
export const toClientSession = (s: SessionUser): ClientSession => ({
  userId: s.userId,
  email: s.email,
  fullName: s.fullName,
  nickname: s.nickname,
  avatar: s.avatar,
  birthDate: s.birthDate,
  roleCode: s.roleCode,
  roleName: s.roleName,
  permissions: s.permissions,
  isPlatform: s.isPlatform,
  doctorId: s.doctorId,
  tenant: s.tenant,
});
