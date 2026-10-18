/**
 * Crea un usuario super admin de plataforma.
 * Uso: SUPERADMIN_EMAIL=... SUPERADMIN_NAME="..." SUPERADMIN_PASSWORD=... npm run db:superadmin
 * El usuario deberá cambiar la contraseña en su primer ingreso.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { callSp } from '@/lib/server/db';
import { hashPassword, passwordPolicyErrors } from '@/lib/server/password';

const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
const name = process.env.SUPERADMIN_NAME?.trim() || 'Super Admin';
const password = process.env.SUPERADMIN_PASSWORD ?? '';

if (!email) throw new Error('Define SUPERADMIN_EMAIL');
const errors = passwordPolicyErrors(password);
if (errors.length) throw new Error(`SUPERADMIN_PASSWORD no cumple la política: ${errors.join(', ')}`);

await callSp('sp_user_create', [null, null, 'cli', randomUUID(), email, name, 'SUPER_ADMIN', await hashPassword(password), null]);
console.log(`✓ Super admin creado: ${email}`);
process.exit(0);
