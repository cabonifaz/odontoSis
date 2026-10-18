import QRCode from 'qrcode';
import { z } from 'zod';
import { route } from '@/lib/server/http';
import { startTotpSetup } from '@/lib/server/services/auth';

const schema = z.object({ password: z.string().min(1, 'Ingresa tu contraseña').max(128) });

/** Alta de 2FA: requiere la contraseña actual (re-autenticación). */
export const POST = route({ allowPending: true, limit: { key: 'totp-setup', max: 10, windowMs: 5 * 60_000 } }, async ({ user, body }) => {
  const { password } = await body(schema);
  const { secret, uri } = await startTotpSetup(user, password);
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
});
