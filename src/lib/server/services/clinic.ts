import 'server-only';
import type { z } from 'zod';
import { callSp, spOne, spRows, type Row } from '../db';
import { blindIndex, decrypt, encrypt } from '../crypto';
import type {
  AppointmentInput, BudgetInput, PatientInput, agreementSchema, branchSchema, doctorSchema, masterItemSchema, serviceSchema, tenantSettingsSchema,
} from '@/lib/shared/schemas';
import { toDbDateTime } from '@/lib/shared/format';

/** Contexto de toda operación de clínica: tenant + actor + IP (para auditoría). */
export type Ctx = { tenantId: string; userId: string; ip: string | null };
const base = (c: Ctx) => [c.tenantId, c.userId, c.ip] as const;

// ---------------- Configuración / catálogos ----------------
export const updateSettings = (c: Ctx, s: z.infer<typeof tenantSettingsSchema>) =>
  callSp('sp_tenant_settings_update', [...base(c), s.tradeName, s.email, s.phone, s.address, s.budgetValidityDays, s.budgetNotes]);

export const listMasterItems = (tenantId: string | null, tableCode: string | null, includeInactive = false) =>
  spRows('sp_master_item_list', [tenantId, tableCode, includeInactive ? 1 : 0]);
export const listMasterTables = () => spRows('sp_master_table_list');
export const saveMasterItem = (tenantId: string | null, a: { userId: string; ip: string | null }, m: z.infer<typeof masterItemSchema>) =>
  callSp('sp_master_item_save', [tenantId, a.userId, a.ip, m.id, m.tableCode, m.code, m.name, m.value, m.sortOrder, m.isActive]);
export const deleteMasterItem = (tenantId: string | null, a: { userId: string; ip: string | null }, id: string) =>
  callSp('sp_master_item_delete', [tenantId, a.userId, a.ip, id]);

// ---------------- Doctores ----------------
export async function listDoctors(tenantId: string, includeInactive = false) {
  const rows = await spRows('sp_doctor_list', [tenantId, includeInactive ? 1 : 0]);
  return rows.map(({ phone_enc, ...r }) => ({ ...r, phone: decrypt(phone_enc) }));
}
export const saveDoctor = (c: Ctx, d: z.infer<typeof doctorSchema>) =>
  callSp('sp_doctor_save', [...base(c), d.id, d.userId, d.firstName, d.lastName, d.licenseNumber, d.specialtyId, d.email,
    encrypt(d.phone), d.agendaColor, d.isActive]);
export const deleteDoctor = (c: Ctx, id: string) => callSp('sp_doctor_delete', [...base(c), id]);

// ---------------- Pacientes ----------------
export async function listPatients(tenantId: string, q: { search?: string | null; limit?: number; offset?: number }) {
  // Si la búsqueda parece un documento, se usa el blind index (el número está cifrado)
  const search = q.search?.trim() || null;
  const docBidx = search && /^[A-Za-z0-9.-]{6,15}$/.test(search) && /\d{6,}/.test(search) ? blindIndex(search) : null;
  let rows = await spRows('sp_patient_list', [tenantId, search, docBidx, q.limit ?? 50, q.offset ?? 0]);
  if (docBidx && rows.length === 0) rows = await spRows('sp_patient_list', [tenantId, search, null, q.limit ?? 50, q.offset ?? 0]);
  return {
    total: Number(rows[0]?.total_count ?? 0),
    rows: rows.map(({ doc_number_enc, phone_enc, total_count: _t, ...r }) => ({
      ...r, doc_number: decrypt(doc_number_enc), phone: decrypt(phone_enc),
    })),
  };
}

export async function getPatient(c: Ctx, id: string) {
  const r = await spOne('sp_patient_get', [c.tenantId, id]);
  if (!r) return null;
  await callSp('sp_patient_access_log', [...base(c), id]);
  return {
    id: r.id, recordNumber: r.record_number, docTypeId: r.doc_type_id, docNumber: decrypt(r.doc_number_enc),
    firstName: r.first_name, lastName: r.last_name, birthDate: r.birth_date, sexId: r.sex_id,
    phone: decrypt(r.phone_enc), email: decrypt(r.email_enc), address: decrypt(r.address_enc),
    insuranceCompany: r.insurance_company, deductible: r.deductible, coinsurancePct: r.coinsurance_pct,
    allergies: decrypt(r.allergies_enc), medicalHistory: decrypt(r.medical_history_enc), notes: decrypt(r.notes_enc),
    isActive: !!r.is_active, createdAt: r.created_at, updatedAt: r.updated_at,
    requiresGuardian: !!r.requires_guardian, guardianName: r.guardian_name, guardianRelationshipId: r.guardian_relationship_id,
    guardianRelationshipName: r.guardian_relationship_name, guardianDocTypeId: r.guardian_doc_type_id,
    guardianDocTypeCode: r.guardian_doc_type_code, guardianDocNumber: decrypt(r.guardian_doc_number_enc),
    guardianPhone: decrypt(r.guardian_phone_enc), guardianEmail: decrypt(r.guardian_email_enc),
    agreementId: r.agreement_id, agreementName: r.agreement_name, agreementDiscountPct: r.agreement_discount_pct,
    agreementMemberCode: r.agreement_member_code,
  };
}

export async function savePatient(c: Ctx, p: PatientInput) {
  return spOne('sp_patient_save', [...base(c), p.id, p.docTypeId, encrypt(p.docNumber), blindIndex(p.docNumber),
    p.firstName, p.lastName, p.birthDate, p.sexId, encrypt(p.phone), encrypt(p.email), encrypt(p.address),
    p.insuranceCompany, p.deductible, p.coinsurancePct, encrypt(p.allergies), encrypt(p.medicalHistory), encrypt(p.notes), p.isActive,
    p.requiresGuardian, p.guardianName, p.guardianRelationshipId, p.guardianDocTypeId, encrypt(p.guardianDocNumber),
    encrypt(p.guardianPhone), encrypt(p.guardianEmail), p.agreementId, p.agreementMemberCode, p.agreementId ? null : p.agreementName]);
}
export const deletePatient = (c: Ctx, id: string) => callSp('sp_patient_delete', [...base(c), id]);

export const getPatientOdontogram = (tenantId: string, patientId: string) => spRows('sp_odontogram_patient_get', [tenantId, patientId]);
export const savePatientOdontogram = (c: Ctx, patientId: string, marks: unknown[]) =>
  callSp('sp_odontogram_patient_save', [...base(c), patientId, JSON.stringify(marks)]);

// ---------------- Sedes (las habilita el super admin; la clínica sólo las consulta) ----------------
export const listBranches = (tenantId: string, includeInactive = false) => spRows('sp_branch_list', [tenantId, includeInactive ? 1 : 0]);
export const saveBranch = (c: Ctx, b: z.infer<typeof branchSchema>) =>
  callSp('sp_branch_save', [...base(c), b.id, b.code.toUpperCase(), b.name, b.address, b.phone, b.isMain, b.isActive]);
export const deleteBranch = (c: Ctx, id: string) => callSp('sp_branch_delete', [...base(c), id]);

// ---------------- Convenios ----------------
export const listAgreements = (tenantId: string, includeInactive = false) => spRows('sp_agreement_list', [tenantId, includeInactive ? 1 : 0]);
export const saveAgreement = (c: Ctx, a: z.infer<typeof agreementSchema>) =>
  callSp('sp_agreement_save', [...base(c), a.id, a.code, a.name, a.companyName, a.discountPct, a.validFrom, a.validTo,
    a.requiresMemberCode, a.notes, a.isActive]);
export const deleteAgreement = (c: Ctx, id: string) => callSp('sp_agreement_delete', [...base(c), id]);

// ---------------- Lista de precios ----------------
export const listServices = (tenantId: string, search?: string | null, includeInactive = false) =>
  spRows('sp_service_list', [tenantId, search ?? null, includeInactive ? 1 : 0]);
export const saveService = (c: Ctx, s: z.infer<typeof serviceSchema>) =>
  callSp('sp_service_save', [...base(c), s.id, s.code, s.name, s.categoryId, s.currencyCode, s.price, s.requiresLab, s.perPiece, s.isActive]);
export const deleteService = (c: Ctx, id: string) => callSp('sp_service_delete', [...base(c), id]);

// ---------------- Presupuestos ----------------
export async function listBudgets(tenantId: string, q: { search?: string | null; patientId?: string | null; status?: string | null; limit?: number; offset?: number }) {
  const rows = await spRows('sp_budget_list', [tenantId, q.search ?? null, q.patientId ?? null, q.status ?? null, q.limit ?? 50, q.offset ?? 0]);
  return { total: Number(rows[0]?.total_count ?? 0), rows: rows.map(({ total_count: _t, ...r }) => r) };
}

export async function getBudget(tenantId: string, id: string) {
  const [head, items, marks] = await callSp('sp_budget_get', [tenantId, id]);
  const h = head?.[0] as Row | undefined;
  if (!h) return null;
  const { doc_number_enc, guardian_doc_number_enc, ...rest } = h;
  return { ...rest, doc_number: decrypt(doc_number_enc), guardian_doc_number: decrypt(guardian_doc_number_enc), items, marks };
}

/** canEdit: el usuario puede modificar presupuestos ya emitidos (budgets.edit). El SP lo valida. */
export const saveBudget = (c: Ctx, b: BudgetInput, canEdit: boolean) =>
  spOne('sp_budget_save', [...base(c), b.id, b.patientId, b.doctorId, b.budgetDate, b.statusCode, b.insuranceCompany,
    b.deductible, b.coinsurancePct, b.discount, b.notes, JSON.stringify(b.items), JSON.stringify(b.marks), b.agreementId, canEdit, b.branchId]);
export const setBudgetStatus = (c: Ctx, id: string, status: string) => callSp('sp_budget_status_set', [...base(c), id, status]);
export const deleteBudget = (c: Ctx, id: string) => callSp('sp_budget_delete', [...base(c), id]);

// ---------------- Citas ----------------
export const listAppointments = (tenantId: string, from: Date, to: Date, doctorId?: string | null, patientId?: string | null) =>
  spRows('sp_appointment_list', [tenantId, toDbDateTime(from), toDbDateTime(to), doctorId ?? null, patientId ?? null]);
export const saveAppointment = (c: Ctx, a: AppointmentInput) =>
  spOne('sp_appointment_save', [...base(c), a.id, a.patientId, a.doctorId, toDbDateTime(a.startAt), toDbDateTime(a.endAt),
    a.statusCode, a.reason, a.notes, a.branchId]);
export const setAppointmentStatus = (c: Ctx, id: string, status: string) => callSp('sp_appointment_status_set', [...base(c), id, status]);
export const deleteAppointment = (c: Ctx, id: string) => callSp('sp_appointment_delete', [...base(c), id]);

// ---------------- Dashboard ----------------
export async function tenantDashboard(tenantId: string, dayStart: Date, dayEnd: Date, doctorId: string | null) {
  const [kpis, appts] = await callSp('sp_tenant_dashboard', [tenantId, toDbDateTime(dayStart), toDbDateTime(dayEnd), doctorId]);
  return { kpis: kpis[0], appointments: appts };
}

// ---------------- Sincronización offline ----------------
export async function syncPull(tenantId: string, since: string | null) {
  const [time, masters, doctors, services, patients, appointments, budgets, agreements, branches] = await callSp('sp_sync_pull', [tenantId, since]);
  return {
    serverTime: time[0].server_time as string,
    masters, doctors, services, appointments, budgets, agreements, branches,
    patients: patients.map(({ phone_enc, guardian_phone_enc, ...p }) => ({ ...p, phone: decrypt(phone_enc), guardian_phone: decrypt(guardian_phone_enc) })),
  };
}
