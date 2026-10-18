import { z } from 'zod';

// Mensajes de validación en español (cliente y servidor)
z.config(z.locales.es());

/** Derivaciones y cartas de garantía (ficha del paciente). El servidor SIEMPRE re-valida. */

const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullish().or(z.literal('').transform(() => null));
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const optDate = date.nullish().or(z.literal('').transform(() => null));
/** Número opcional: '' / null / ausente => null */
const optNum = (max: number) => z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)),
  z.number().min(0).max(max).nullable()).optional().transform((v) => v ?? null);

export const REFERRAL_STATUSES = ['PENDING', 'SCHEDULED', 'ATTENDED', 'CANCELLED'] as const;
export const GUARANTEE_LETTER_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'PARTIAL', 'REJECTED'] as const;

export const referralSchema = z.object({
  id: uuid,
  fromDoctorId: optUuid,
  referralDate: date,
  specialtyId: optUuid,
  isInternal: z.boolean().default(false),
  toDoctorId: optUuid,
  referredToName: optText(200),
  referredToContact: optText(200),
  reason: z.string().trim().min(3, 'Indica el motivo de la derivación').max(4000),
  clinicalNotes: optText(8000),
  statusCode: z.enum(REFERRAL_STATUSES).default('PENDING'),
  responseNotes: optText(8000),
}).superRefine((v, ctx) => {
  if (v.isInternal && !v.toDoctorId) ctx.addIssue({ code: 'custom', path: ['toDoctorId'], message: 'Selecciona el doctor al que se deriva' });
  if (!v.isInternal && !v.referredToName) ctx.addIssue({ code: 'custom', path: ['referredToName'], message: 'Indica el especialista o la clínica' });
});
export type ReferralInput = z.infer<typeof referralSchema>;

export const guaranteeLetterSchema = z.object({
  id: uuid,
  budgetId: optUuid,
  insuranceCompany: z.string().trim().min(2, 'Indica la aseguradora').max(150),
  letterNumber: optText(40),
  requestDate: date,
  responseDate: optDate,
  amountRequested: z.coerce.number().min(0).max(9_999_999),
  amountApproved: optNum(9_999_999),
  coveragePct: optNum(100),
  statusCode: z.enum(GUARANTEE_LETTER_STATUSES).default('DRAFT'),
  validUntil: optDate,
  notes: optText(4000),
}).superRefine((v, ctx) => {
  if (v.responseDate && v.responseDate < v.requestDate) {
    ctx.addIssue({ code: 'custom', path: ['responseDate'], message: 'La respuesta no puede ser anterior a la solicitud' });
  }
});
export type GuaranteeLetterInput = z.infer<typeof guaranteeLetterSchema>;
