import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { listConsents, registerConsents } from '@/lib/server/services/consents';
import { consentSchema } from '@/lib/shared/schemas';

const id = z.string().uuid();
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' && v !== '' ? v : undefined);

/** Consentimientos del paciente + datos de la clínica para imprimir el formato */
export const GET = route<{ id: string }>({ platform: false, perm: 'patients.read' }, async ({ user, params }) =>
  listConsents(tenantOf(user), id.parse(params.id)));

/**
 * Registro del formato firmado (multipart): `file` (escaneo o foto, JPG/PNG/WEBP/PDF) + datos de quien firmó.
 * `types` puede repetirse: un mismo formato cubre ambos consentimientos.
 */
export const POST = route<{ id: string }>({ platform: false, perm: 'patients.write', limit: { key: 'consent', max: 30, windowMs: 60_000 } },
  async ({ req, user, ip, params }) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    // Los datos se validan ANTES de escribir el archivo en disco
    const input = consentSchema.parse({
      types: form?.getAll('types').filter((t) => typeof t === 'string') ?? [],
      signerType: str(form?.get('signerType') ?? null), signerName: str(form?.get('signerName') ?? null),
      signerDocTypeId: str(form?.get('signerDocTypeId') ?? null), signerDocNumber: str(form?.get('signerDocNumber') ?? null),
      signerRelationshipId: str(form?.get('signerRelationshipId') ?? null), signedOn: str(form?.get('signedOn') ?? null),
      marketingOptIn: form?.get('marketingOptIn') === 'true', notes: str(form?.get('notes') ?? null),
    });
    return registerConsents({ tenantId: tenantOf(user), userId: user.userId, ip }, id.parse(params.id), input, file instanceof File ? file : null);
  });
