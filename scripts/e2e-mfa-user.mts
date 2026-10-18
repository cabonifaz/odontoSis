/**
 * SOLO pruebas (staging/desarrollo): usuario de recepción de la clínica demo con 2FA ya activo y secreto conocido,
 * para probar fuerza bruta y repetición de códigos. Restablece bloqueos y contadores en cada ejecución.
 * Imprime JSON: { email, password, secret }
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { callSp, spRows } from '@/lib/server/db';
import { encrypt } from '@/lib/server/crypto';
import { hashPassword } from '@/lib/server/password';
import { generateTotpSecret } from '@/lib/server/totp';
import { listTenants } from '@/lib/server/services/platform';

if (process.env.APP_ENV === 'production') throw new Error('No disponible en producción');
const email = 'mfa-e2e@demo.odontosis.pe';
const password = process.env.E2E_ADMIN_PASSWORD!;
const demo = (await listTenants('demo')).find((t) => t.code === 'demo');
if (!demo) throw new Error('No existe la clínica demo');
const tenantId = demo.id as string;
const hash = await hashPassword(password);
const existing = (await spRows<{ id: string; email: string }>('sp_user_list', [tenantId])).find((u) => u.email === email);
const id = existing?.id ?? randomUUID();
if (!existing) await callSp('sp_user_create', [tenantId, null, 'e2e', id, email, 'Recepción 2FA E2E', 'RECEPTIONIST', hash, null]);
await callSp('sp_user_password_set', [id, hash, 0, null, 'e2e']); // también limpia bloqueos
const secret = generateTotpSecret();
await callSp('sp_user_totp_set', [id, encrypt(secret), 1, null, 'e2e']); // reinicia anti-repetición y fallos
console.log(JSON.stringify({ email, password, secret }));
process.exit(0);
