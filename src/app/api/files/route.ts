import { z } from 'zod';
import { route } from '@/lib/server/http';
import { AppError } from '@/lib/server/errors';
import { saveUpload } from '@/lib/server/services/files';
import { rateLimit } from '@/lib/server/rate-limit';
import { can } from '@/lib/shared/types';

const kindSchema = z.enum(['LOGO', 'INVOICE', 'PAYMENT_PROOF', 'CONTRACT', 'REQUEST_ATTACHMENT']).default('LOGO');

/**
 * Subida de archivos.
 *  - LOGO: la clínica (settings.manage) o el super admin para una clínica (tenantId en el form).
 *  - INVOICE / PAYMENT_PROOF / CONTRACT: sólo super admin; documentos de plataforma (no visibles para la clínica).
 *  - REQUEST_ATTACHMENT: cualquier usuario de clínica (capturas para sus solicitudes de soporte y mejoras).
 */
export const POST = route({ limit: { key: 'upload', max: 30, windowMs: 60_000 } }, async ({ req, user, ip }) => {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError('INVALID_FILE');
  const kind = kindSchema.parse(form.get('kind') ?? undefined);

  let tenantId: string | null;
  if (kind === 'REQUEST_ATTACHMENT') {
    if (user.isPlatform || !user.tenant) throw new AppError('FORBIDDEN');
    rateLimit(`req-attachment:${user.userId}`, 30, 60 * 60_000); // capturas: tope por usuario y hora
    tenantId = user.tenant.id;
  } else if (kind !== 'LOGO') {
    if (!user.isPlatform) throw new AppError('FORBIDDEN');
    tenantId = null;
  } else if (user.isPlatform) {
    tenantId = z.string().uuid().parse(form.get('tenantId'));
  } else {
    if (!can(user.permissions, 'settings.manage')) throw new AppError('FORBIDDEN');
    tenantId = user.tenant!.id;
  }
  return saveUpload({ tenantId, actorId: user.userId, ip, kind, file });
});
