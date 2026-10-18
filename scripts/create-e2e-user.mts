/**
 * Crea (o restablece) el usuario de pruebas automáticas de la clínica demo. SOLO staging/desarrollo.
 * Uso: E2E_ADMIN_PASSWORD=... npm run db:e2e-user
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { callSp, spRows } from '@/lib/server/db';
import { hashPassword, passwordPolicyErrors } from '@/lib/server/password';
import { listTenants } from '@/lib/server/services/platform';

if (process.env.APP_ENV === 'production') throw new Error('No se crean usuarios de prueba en producción');
const email = (process.env.E2E_ADMIN_EMAIL ?? 'e2e@demo.odontosis.pe').toLowerCase();
const password = process.env.E2E_ADMIN_PASSWORD ?? '';
const errors = passwordPolicyErrors(password);
if (errors.length) throw new Error(`E2E_ADMIN_PASSWORD no cumple la política: ${errors.join(', ')}`);

const demo = (await listTenants('demo')).find((t) => t.code === 'demo');
if (!demo) throw new Error('No existe la clínica demo (npm run db:seed-demo)');
const tenantId = demo.id as string;

const hash = await hashPassword(password);
const existing = (await spRows<{ id: string; email: string }>('sp_user_list', [tenantId])).find((u) => u.email === email);
const id = existing?.id ?? randomUUID();
if (!existing) {
  await callSp('sp_user_create', [tenantId, null, 'e2e', id, email, 'Usuario Pruebas E2E', 'CLINIC_ADMIN', hash, null]);
}
// Contraseña conocida y sin cambio obligatorio (sólo para pruebas automáticas)
await callSp('sp_user_password_set', [id, hash, 0, null, 'e2e']);
console.log(`✓ Usuario de pruebas listo: ${email}`);
process.exit(0);
