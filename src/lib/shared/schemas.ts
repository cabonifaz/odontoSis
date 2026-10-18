import { z } from 'zod';
import { ageFrom } from './format';

// Mensajes de validación en español (cliente y servidor)
z.config(z.locales.es());

/** Esquemas compartidos cliente/servidor. El servidor SIEMPRE re-valida. */

/** Menor de edad (< 18 años) según la fecha de nacimiento */
export const isMinor = (birthDate: string | null | undefined) => {
  const age = ageFrom(birthDate);
  return age !== null && age < 18;
};

const uuid = z.string().uuid();
const optUuid = z.string().uuid().nullish().or(z.literal('').transform(() => null));
const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const optDate = date.nullish().or(z.literal('').transform(() => null));
const isoDateTime = z.string().datetime({ offset: true });
const money = z.coerce.number().min(0).max(9_999_999);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido');
const code = z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Sólo letras, números, guion y guion bajo');

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
  /** Código de la clínica cuando se ingresa desde su link (/c/<código>) */
  tenantCode: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,40}$/).optional(),
});

export const mfaSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos') });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
});

const tenantBase = z.object({
  code: code.transform((v) => v.toLowerCase()),
  legalName: text(200).min(2),
  tradeName: text(200).min(2),
  taxId: optText(20),
  email: z.string().trim().email().max(200).nullish().or(z.literal('').transform(() => null)),
  phone: optText(40),
  address: optText(300),
  planId: uuid,
  /** IMPLEMENTATION = periodo de implementación; ACTIVE = producción (requiere contrato) */
  statusCode: z.enum(['IMPLEMENTATION', 'ACTIVE', 'SUSPENDED', 'CANCELLED']),
  maxUsersOverride: z.coerce.number().int().min(1).max(1000).nullish().or(z.literal('').transform(() => null)),
  primaryColor: hex.default('#0E7490'),
  secondaryColor: hex.default('#F59E0B'),
  currencyCode: z.enum(['PEN', 'USD']).default('PEN'),
  timezone: text(64).default('America/Lima').refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Zona horaria inválida'),
  /** Sedes activas permitidas para esta clínica (vacío = las del plan) */
  maxBranchesOverride: z.coerce.number().int().min(1).max(500).nullish().or(z.literal('').transform(() => null)),
  /** Ficha de paciente estándar (clínica pequeña) o avanzada (clínica grande). La define el super admin */
  patientFormMode: z.enum(['STANDARD', 'ADVANCED']).default('STANDARD'),
  // Periodo de implementación (entrenamiento, carga de datos, pruebas) y su límite de pacientes
  implementationStart: optDate,
  implementationEnd: optDate,
  implementationMaxPatients: z.coerce.number().int().min(1).max(100_000).nullish().or(z.literal('').transform(() => null)),
  adminEmail: z.string().trim().toLowerCase().email().max(200),
  adminName: text(200).min(2),
});

const implementationRule = (t: { statusCode: string; implementationStart?: string | null; implementationEnd?: string | null }, ctx: z.RefinementCtx) => {
  if (t.statusCode !== 'IMPLEMENTATION') return;
  if (!t.implementationStart) ctx.addIssue({ code: 'custom', path: ['implementationStart'], message: 'Indica el inicio de la implementación' });
  if (!t.implementationEnd) ctx.addIssue({ code: 'custom', path: ['implementationEnd'], message: 'Indica el fin de la implementación' });
  if (t.implementationStart && t.implementationEnd && t.implementationEnd < t.implementationStart) {
    ctx.addIssue({ code: 'custom', path: ['implementationEnd'], message: 'Debe ser posterior al inicio' });
  }
};

export const tenantCreateSchema = tenantBase.superRefine(implementationRule);
export const tenantUpdateSchema = tenantBase
  .omit({ code: true, adminEmail: true, adminName: true, primaryColor: true, secondaryColor: true })
  .superRefine(implementationRule);

/** Contrato que sustenta el inicio y fin oficial de la suscripción */
export const contractSchema = z.object({
  id: uuid,
  contractNumber: text(40).min(1, 'Ingresa el N° de contrato'),
  startDate: date,
  endDate: date,
  fileId: z.string().uuid('Adjunta el contrato firmado'),
  signedAt: optDate,
  notes: optText(500),
}).refine((c) => c.endDate >= c.startDate, { path: ['endDate'], message: 'Debe ser posterior al inicio' });

export const implementationExtendSchema = z.object({
  newEnd: date,
  reason: text(500).min(3, 'Indica el motivo de la ampliación'),
});

export const requestCreateSchema = z.object({
  id: uuid,
  typeCode: z.enum(['IMPROVEMENT', 'BUG', 'QUESTION', 'TRAINING']),
  title: text(200).min(3, 'Describe brevemente la solicitud'),
  description: text(5000).min(5, 'Agrega el detalle'),
});
export const requestUpdateSchema = z.object({
  statusCode: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED']),
  response: optText(5000),
});

export const brandingSchema = z.object({
  primaryColor: hex,
  secondaryColor: hex,
  logoFileId: optUuid,
  clearLogo: z.boolean().default(false),
});

export const tenantSettingsSchema = z.object({
  tradeName: text(200).min(2),
  email: z.string().trim().email().max(200).nullish().or(z.literal('').transform(() => null)),
  phone: optText(40),
  address: optText(300),
  budgetValidityDays: z.coerce.number().int().min(1).max(365),
  budgetNotes: optText(2000),
});

export const planSchema = z.object({
  id: uuid,
  code: code.transform((v) => v.toUpperCase()),
  name: text(120).min(2),
  description: optText(500),
  maxUsers: z.coerce.number().int().min(1).max(1000),
  /** Sedes (locales) activas permitidas */
  maxBranches: z.coerce.number().int().min(1, 'Mínimo 1 sede').max(500).default(1),
  maxPatients: z.coerce.number().int().min(1).nullish().or(z.literal('').transform(() => null)),
  maxStorageMb: z.coerce.number().int().min(10).max(1_000_000),
  price: money,
  currencyCode: z.enum(['PEN', 'USD']),
  periodCode: z.enum(['MONTHLY', 'YEARLY']),
  isActive: z.boolean(),
});

export const paymentSchema = z.object({
  id: uuid,
  tenantId: uuid,
  planId: uuid,
  amount: money,
  currencyCode: z.enum(['PEN', 'USD']),
  periodStart: date,
  periodEnd: date,
  paidAt: optDate,
  methodCode: z.enum(['TRANSFER', 'CARD', 'CASH', 'YAPE', 'PLIN']).nullish(),
  statusCode: z.enum(['PENDING', 'PAID', 'VOID']),
  reference: optText(120),
  notes: optText(500),
  invoiceNumber: optText(40),
  invoiceFileId: optUuid,
  receiptFileId: optUuid,
}).superRefine((p, ctx) => {
  // Un pago PAGADO exige la factura emitida y el comprobante/evidencia del pago
  if (p.statusCode !== 'PAID') return;
  if (!p.invoiceNumber) ctx.addIssue({ code: 'custom', path: ['invoiceNumber'], message: 'Ingresa el N° de factura' });
  if (!p.invoiceFileId) ctx.addIssue({ code: 'custom', path: ['invoiceFileId'], message: 'Adjunta la factura emitida' });
  if (!p.receiptFileId) ctx.addIssue({ code: 'custom', path: ['receiptFileId'], message: 'Adjunta el comprobante o evidencia de pago' });
});

const grantable = z.enum(['budgets.edit']);
export const permissionOverridesSchema = z.object({ grant: z.array(grantable).max(20), deny: z.array(grantable).max(20) });

export const userCreateSchema = z.object({
  id: uuid,
  email: z.string().trim().toLowerCase().email().max(200),
  fullName: text(200).min(2),
  roleCode: z.string().max(40),
  permissionOverrides: permissionOverridesSchema.nullish(),
});

export const userUpdateSchema = z.object({
  fullName: text(200).min(2),
  roleCode: z.string().max(40),
  isActive: z.boolean(),
  /** undefined = conservar los actuales */
  permissionOverrides: permissionOverridesSchema.nullish(),
});

export const masterItemSchema = z.object({
  id: uuid,
  tableCode: z.string().max(60),
  code: code.transform((v) => v.toUpperCase()),
  name: text(150).min(1),
  value: optText(255),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const doctorSchema = z.object({
  id: uuid,
  userId: optUuid,
  firstName: text(100).min(1),
  lastName: text(100).min(1),
  licenseNumber: optText(30),
  specialtyId: optUuid,
  email: z.string().trim().email().max(200).nullish().or(z.literal('').transform(() => null)),
  phone: optText(40),
  agendaColor: hex.default('#0E7490'),
  birthDate: optDate,
  isActive: z.boolean().default(true),
});

export const patientSchema = z.object({
  id: uuid,
  docTypeId: optUuid,
  docNumber: optText(20),
  firstName: text(100).min(1, 'Requerido'),
  lastName: text(100).min(1, 'Requerido'),
  birthDate: optDate,
  sexId: optUuid,
  phone: optText(40),
  email: z.string().trim().email('Correo inválido').max(200).nullish().or(z.literal('').transform(() => null)),
  address: optText(300),
  insuranceCompany: optText(150),
  deductible: money.nullish().or(z.literal('').transform(() => null)),
  coinsurancePct: z.coerce.number().min(0).max(100).nullish().or(z.literal('').transform(() => null)),
  allergies: optText(2000),
  medicalHistory: optText(5000),
  notes: optText(2000),
  isActive: z.boolean().default(true),
  // Apoderado (obligatorio para menores de edad o si se marca "requiere apoderado")
  requiresGuardian: z.boolean().default(false),
  guardianName: optText(200),
  guardianRelationshipId: optUuid,
  guardianDocTypeId: optUuid,
  guardianDocNumber: optText(20),
  guardianPhone: optText(40),
  guardianEmail: z.string().trim().email('Correo inválido').max(200).nullish().or(z.literal('').transform(() => null)),
  // Convenio (acuerdo con empresa o club) y N° de socio / carnet
  agreementId: optUuid,
  /** Convenio escrito que aún no existe: el SP lo crea (o reutiliza si ya existe con ese nombre) */
  agreementName: optText(150),
  agreementMemberCode: optText(40),
  // ---- Ficha avanzada (opcionales en la estándar) ----
  /** Modo de la ficha con que se capturó: en ADVANCED se exigen celular, captación, doctor, tipo de atención y tarifario */
  formMode: z.enum(['STANDARD', 'ADVANCED']).default('STANDARD'),
  motherLastName: optText(100),
  mobile: optText(40),
  messaging: optText(40),
  maritalStatusId: optUuid,
  acquisitionSourceId: optUuid,
  cardNumber: optText(40),
  districtId: optUuid,
  homeBranchId: optUuid,
  assignedDoctorId: optUuid,
  attentionTypeId: optUuid,
  priceListId: optUuid,
  titularPatientId: optUuid,
  titularRelationshipId: optUuid,
}).superRefine((p, ctx) => {
  if (p.formMode !== 'ADVANCED') return;
  const req = (k: keyof typeof p, message: string) => { if (!p[k]) ctx.addIssue({ code: 'custom', path: [k], message }); };
  req('motherLastName', 'Ingresa el apellido materno');
  req('mobile', 'Ingresa el celular');
  req('acquisitionSourceId', 'Indica cómo nos conoció');
  req('assignedDoctorId', 'Asigna un doctor');
  req('attentionTypeId', 'Indica el tipo de atención');
  req('priceListId', 'Elige el tarifario');
}).superRefine((p, ctx) => {
  if (!p.requiresGuardian && !isMinor(p.birthDate)) return;
  if (!p.guardianName) ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'Ingresa el nombre del apoderado' });
  // El apoderado no puede ser el mismo paciente
  const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (p.guardianName && norm(p.guardianName) === norm(`${p.firstName} ${p.lastName}`)) {
    ctx.addIssue({ code: 'custom', path: ['guardianName'], message: 'El apoderado no puede ser el mismo paciente' });
  }
  const doc = (s: string | null | undefined) => (s ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (p.guardianDocNumber && p.docNumber && doc(p.guardianDocNumber) === doc(p.docNumber)) {
    ctx.addIssue({ code: 'custom', path: ['guardianDocNumber'], message: 'El documento del apoderado no puede ser el del paciente' });
  }
  if (!p.guardianRelationshipId) ctx.addIssue({ code: 'custom', path: ['guardianRelationshipId'], message: 'Selecciona el parentesco' });
});

export const branchSchema = z.object({
  id: uuid,
  code: z.string().trim().min(1, 'Requerido').max(20).regex(/^[A-Za-z0-9_-]+$/, 'Sólo letras, números, guion y guion bajo'),
  name: text(120).min(2, 'Requerido'),
  address: optText(300),
  phone: optText(40),
  isMain: z.boolean().default(false),
  isActive: z.boolean().default(true),
  /** Modo de ficha de la sede (vacío = el de la clínica). Lo define el super admin */
  patientFormMode: z.enum(['STANDARD', 'ADVANCED']).nullish().or(z.literal('').transform(() => null)),
});

export const priceListSchema = z.object({
  id: uuid,
  code: z.string().trim().min(1, 'Requerido').max(30).regex(/^[A-Za-z0-9_-]+$/, 'Sólo letras, números, guion y guion bajo'),
  name: text(120).min(2, 'Requerido'),
  groupName: optText(120),
  branchId: optUuid,
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export const priceListItemSchema = z.object({ serviceId: uuid, price: z.coerce.number().min(0).max(9_999_999).nullable() });

/** Perfil propio del usuario: apodo y avatar (un toque divertido) y cumpleaños */
export const profileSchema = z.object({
  fullName: text(200).min(2),
  nickname: optText(40),
  avatar: z.string().max(40).regex(/^[a-z0-9-]*$/).nullish(),
  birthDate: optDate,
});

export const agreementSchema = z.object({
  id: uuid,
  code: z.string().trim().min(1).max(30),
  name: text(150).min(2),
  companyName: optText(200),
  discountPct: z.coerce.number().min(0, 'Mínimo 0 %').max(100, 'Máximo 100 %'),
  validFrom: optDate,
  validTo: optDate,
  requiresMemberCode: z.boolean().default(false),
  notes: optText(500),
  isActive: z.boolean().default(true),
}).refine((a) => !a.validFrom || !a.validTo || a.validTo >= a.validFrom, { path: ['validTo'], message: 'Debe ser posterior al inicio' });

export const serviceSchema = z.object({
  id: uuid,
  code: text(20).min(1),
  name: text(200).min(2),
  categoryId: optUuid,
  currencyCode: z.enum(['PEN', 'USD']).default('PEN'),
  price: money,
  requiresLab: z.boolean().default(false),
  perPiece: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const toothCode = z.string().regex(/^[1-8]\.[1-8]$/, 'Pieza FDI inválida');
export const surfaces = z.string().regex(/^[OVLMD]{0,5}$/, 'Superficies inválidas');

export const budgetItemSchema = z.object({
  id: uuid,
  toothCode: toothCode.nullish().or(z.literal('').transform(() => null)),
  surfaces: surfaces.nullish(),
  serviceId: optUuid,
  description: text(250).min(1),
  quantity: z.coerce.number().min(0.01).max(999),
  unitPrice: money,
  deductible: money.default(0),
  coinsurance: money.default(0),
});

export const odontogramMarkSchema = z.object({
  toothCode,
  surface: z.enum(['O', 'V', 'L', 'M', 'D']).nullish(),
  conditionId: uuid,
  notes: optText(255),
});

export const budgetSchema = z.object({
  id: uuid,
  patientId: uuid,
  doctorId: optUuid,
  budgetDate: date,
  statusCode: z.enum(['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED']).default('DRAFT'),
  insuranceCompany: optText(150),
  deductible: money.default(0),
  coinsurancePct: z.coerce.number().min(0).max(100).default(0),
  discount: money.default(0),
  agreementId: optUuid,
  /** Sede; vacío = sede principal */
  branchId: optUuid,
  /** Tarifario aplicado (los precios unitarios vienen de él) */
  priceListId: optUuid,
  notes: optText(2000),
  items: z.array(budgetItemSchema).min(1, 'Agrega al menos un tratamiento').max(200),
  marks: z.array(odontogramMarkSchema).max(500).default([]),
});

export const appointmentSchema = z.object({
  id: uuid,
  patientId: uuid,
  doctorId: uuid,
  startAt: isoDateTime,
  endAt: isoDateTime,
  statusCode: z.enum(['SCHEDULED', 'CONFIRMED', 'ATTENDED', 'CANCELLED', 'NO_SHOW']).default('SCHEDULED'),
  reason: optText(250),
  notes: optText(2000),
  /** Sede; vacío = sede principal */
  branchId: optUuid,
});

export const statusSchema = z.object({ statusCode: z.string().max(60) });

/** Operaciones offline que se encolan en el cliente y se envían al reconectar. */
export const syncOpSchema = z.discriminatedUnion('type', [
  z.object({ opId: uuid, type: z.literal('patient.save'), payload: patientSchema }),
  z.object({ opId: uuid, type: z.literal('appointment.save'), payload: appointmentSchema }),
  z.object({ opId: uuid, type: z.literal('appointment.status'), payload: z.object({ id: uuid, statusCode: z.string().max(60) }) }),
  z.object({ opId: uuid, type: z.literal('budget.save'), payload: budgetSchema }),
]);
export const syncPushSchema = z.object({ ops: z.array(syncOpSchema).max(200) });

export type PatientInput = z.infer<typeof patientSchema>;
export type BudgetInput = z.infer<typeof budgetSchema>;
export type AppointmentInput = z.infer<typeof appointmentSchema>;
export type SyncOp = z.infer<typeof syncOpSchema>;

/** Plan contratado con el proveedor de DNI: cupo mensual, % de alerta y día de renovación */
export const dniSettingsSchema = z.object({
  quota: z.coerce.number().int().min(0).max(1_000_000),
  alertPct: z.coerce.number().int().min(1).max(100),
  cycleDay: z.coerce.number().int().min(1).max(28),
});
