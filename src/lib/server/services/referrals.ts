import 'server-only';
import { callSp, spOne, spRows } from '../db';
import { decrypt } from '../crypto';
import type { GuaranteeLetterInput, ReferralInput } from '@/lib/shared/referral-schemas';
import type { Ctx } from './clinic';

const base = (c: Ctx) => [c.tenantId, c.userId, c.ip] as const;

// ---------------- Derivaciones ----------------
export const listReferrals = (tenantId: string, patientId: string) => spRows('sp_referral_list', [tenantId, patientId]);

/** Hoja de derivación para imprimir (incluye datos del paciente, doctor y clínica). */
export async function getReferral(tenantId: string, patientId: string, id: string) {
  const r = await spOne('sp_referral_get', [tenantId, patientId, id]);
  if (!r) return null;
  const { doc_number_enc, ...rest } = r;
  return { ...rest, doc_number: decrypt(doc_number_enc) };
}

export const saveReferral = (c: Ctx, patientId: string, r: ReferralInput) =>
  spOne('sp_referral_save', [...base(c), r.id, patientId, r.fromDoctorId, r.referralDate, r.specialtyId,
    r.isInternal ? null : r.referredToName, r.referredToContact, r.isInternal, r.isInternal ? r.toDoctorId : null,
    r.reason, r.clinicalNotes, r.statusCode, r.responseNotes]);

export const deleteReferral = (c: Ctx, patientId: string, id: string) => callSp('sp_referral_delete', [...base(c), patientId, id]);

// ---------------- Cartas de garantía ----------------
export const listGuaranteeLetters = (tenantId: string, patientId: string) => spRows('sp_guarantee_letter_list', [tenantId, patientId]);
export const getGuaranteeLetter = (tenantId: string, patientId: string, id: string) =>
  spOne('sp_guarantee_letter_get', [tenantId, patientId, id]);

export const saveGuaranteeLetter = (c: Ctx, patientId: string, g: GuaranteeLetterInput) =>
  spOne('sp_guarantee_letter_save', [...base(c), g.id, patientId, g.budgetId, g.insuranceCompany, g.letterNumber, g.requestDate,
    g.responseDate, g.amountRequested, g.amountApproved, g.coveragePct, g.statusCode, g.validUntil, g.notes]);

export const deleteGuaranteeLetter = (c: Ctx, patientId: string, id: string) =>
  callSp('sp_guarantee_letter_delete', [...base(c), patientId, id]);
