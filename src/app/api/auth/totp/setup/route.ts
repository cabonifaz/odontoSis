import QRCode from 'qrcode';
import { route } from '@/lib/server/http';
import { startTotpSetup } from '@/lib/server/services/auth';

export const POST = route({ allowPending: true }, async ({ user }) => {
  const { secret, uri } = await startTotpSetup(user);
  return { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
});
