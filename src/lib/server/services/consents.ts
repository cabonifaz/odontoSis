import 'server-only';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { callSp } from '../db';
import { decrypt, encrypt } from '../crypto';
import { AppError } from '../errors';
import { savePatientUpload } from './patient-files';
import type { Ctx } from './clinic';
import { CONSENT_FORM_VERSION, type consentRevokeSchema, type consentSchema } from '@/lib/shared/schemas';

/**
 * Consentimientos del paciente (Ley N° 29733 y Ley N° 26842): el formato firmado se sube escaneado o
 * fotografiado y se registra quién firmó (paciente o apoderado). El documento del firmante va cifrado.
 */
export async function listConsents(tenantId: string, patientId: string) {
  const [rows, clinic] = await callSp('sp_patient_consent_list', [tenantId, patientId]);
  return {
    formVersion: CONSENT_FORM_VERSION,
    clinic: clinic[0] ?? null,
    consents: rows.map(({ signer_doc_number_enc, ...r }) => ({ ...r, signer_doc_number: decrypt(signer_doc_number_enc) })),
  };
}

export async function registerConsents(c: Ctx, patientId: string, input: z.infer<typeof consentSchema>, file: File | null) {
  if (!file) throw new AppError('VALIDATION', 400, 'Adjunta el formato firmado (escaneo o foto).');
  const up = await savePatientUpload(c, patientId, file, 'CONSENT');
  const docEnc = input.signerDocNumber ? encrypt(input.signerDocNumber) : null;
  const ids: string[] = [];
  for (const type of input.types) {
    const id = randomUUID();
    await callSp('sp_patient_consent_save', [c.tenantId, c.userId, c.ip, id, patientId, type, CONSENT_FORM_VERSION,
      input.signerType, input.signerName, input.signerDocTypeId ?? null, docEnc,
      input.signerType === 'GUARDIAN' ? input.signerRelationshipId ?? null : null,
      input.signedOn, input.marketingOptIn, up.id, input.notes ?? null]);
    ids.push(id);
  }
  return { ids, fileId: up.id };
}

export const revokeConsent = (c: Ctx, consentId: string, r: z.infer<typeof consentRevokeSchema>) =>
  callSp('sp_patient_consent_revoke', [c.tenantId, c.userId, c.ip, consentId, r.revokedOn, r.reason]);
