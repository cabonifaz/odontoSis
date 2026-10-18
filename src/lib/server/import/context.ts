import 'server-only';
import { callSp, spRows, type Row } from '../db';
import type { ImportEntity } from '@/lib/shared/import-spec';
import { norm } from './values';
import { blindIndex } from '../crypto';

type Master = { id: string; code: string; name: string };
export type DoctorRow = {
  id: string; code: string | null; license_number: string | null; email: string | null; first_name: string; last_name: string;
  is_active: number; specialty_id: string | null; phone_enc: string | null; agenda_color: string; birth_date: string | null;
};
export type PatientRow = { id: string; record_number: string; doc_number_bidx: string | null; first_name: string; last_name: string; price_list_id: string | null };

/** Catálogo indexado por código y por nombre (sin tildes ni mayúsculas). */
export class Catalog {
  private map = new Map<string, Master>();
  constructor(public readonly items: Master[]) {
    for (const m of items) {
      this.map.set(norm(m.code), m);
      if (!this.map.has(norm(m.name))) this.map.set(norm(m.name), m);
      // "Hijo(a)" también se reconoce como "Hijo"
      const short = norm(m.name.replace(/\(.*?\)/g, ''));
      if (short && !this.map.has(short)) this.map.set(short, m);
    }
  }
  find(v: string | null | undefined) { return v ? this.map.get(norm(v)) ?? null : null; }
  names(limit = 40) { return this.items.slice(0, limit).map((m) => m.name).join(', '); }
}

const MASTERS_BY_ENTITY: Record<ImportEntity, string[]> = {
  DOCTORS: ['SPECIALTY'],
  AGREEMENTS: [],
  SERVICES: ['SERVICE_CATEGORY'],
  PRICE_LIST_ITEMS: [],
  PATIENTS: ['DOC_TYPE', 'SEX', 'GUARDIAN_RELATIONSHIP', 'UBIGEO_DISTRICT'],
  CLINICAL_NOTES: [],
  APPOINTMENTS: ['APPOINTMENT_STATUS'],
  BUDGETS: ['BUDGET_STATUS'],
};

export type ImportContext = Awaited<ReturnType<typeof loadContext>>;

/** Carga todo lo necesario para validar y resolver referencias de una entidad (pocas llamadas a la BD). */
export async function loadContext(tenantId: string, entity: ImportEntity) {
  const tables = MASTERS_BY_ENTITY[entity];
  const [sets, ...masterLists] = await Promise.all([
    callSp('sp_import_context', [tenantId, entity]),
    ...tables.map((t) => spRows<Master>('sp_master_item_list', [tenantId, t, 0])),
  ]);
  const masters = Object.fromEntries(tables.map((t, i) => [t, new Catalog(masterLists[i])])) as Record<string, Catalog>;
  const [info, doctors, agreements, services, priceLists, patients, appointments, budgets, notes, priceItems, branches] = sets as Row[][];
  const i0 = info[0] as Record<string, unknown>;

  // ---- Doctores: por código, COP, correo o nombre completo
  const drs = doctors as unknown as DoctorRow[];
  const doctorKey = new Map<string, DoctorRow>();
  const addDr = (k: string | null | undefined, d: DoctorRow) => { if (k && !doctorKey.has(k)) doctorKey.set(k, d); };
  for (const d of drs) {
    addDr(d.code ? `C:${norm(d.code)}` : null, d);
    addDr(d.license_number ? `L:${norm(d.license_number)}` : null, d);
    addDr(d.email ? `E:${d.email.toLowerCase()}` : null, d);
    addDr(`N:${norm(`${d.first_name} ${d.last_name}`)}`, d);
  }
  const findDoctor = (v: string | null) => {
    if (!v) return null;
    return doctorKey.get(`C:${norm(v)}`) ?? doctorKey.get(`L:${norm(v)}`) ?? doctorKey.get(`E:${v.trim().toLowerCase()}`)
      ?? doctorKey.get(`N:${norm(v)}`) ?? null;
  };

  // ---- Pacientes: por blind index del documento o por N° de H.C.
  const pts = patients as unknown as PatientRow[];
  const byBidx = new Map(pts.filter((p) => p.doc_number_bidx).map((p) => [p.doc_number_bidx!, p]));
  const byHc = new Map(pts.map((p) => [p.record_number.toUpperCase(), p]));
  const findByHc = (hc: string | null) => {
    if (!hc) return null;
    const k = hc.trim().toUpperCase();
    return byHc.get(k) ?? (/^\d{1,6}$/.test(k) ? byHc.get(k.padStart(6, '0')) ?? null : null);
  };

  const agreementsCat = new Catalog((agreements as Row[]).map((a) => ({ id: String(a.id), code: String(a.code), name: String(a.name) })));
  const servicesByCode = new Map((services as Row[]).map((s) => [norm(String(s.code)), { id: String(s.id), code: String(s.code), name: String(s.name), price: Number(s.price) }]));
  const priceListsByCode = new Map((priceLists as Row[]).map((p) => [norm(String(p.code)), { id: String(p.id), code: String(p.code), name: String(p.name) }]));
  const priceItemKey = (listId: string, serviceId: string) => `${listId}|${serviceId}`;
  const priceItemMap = new Map((priceItems as Row[]).map((r) => [priceItemKey(String(r.price_list_id), String(r.service_id)), Number(r.price)]));
  const branchCat = new Catalog((branches as Row[]).filter((b) => Number(b.is_active) === 1).map((b) => ({ id: String(b.id), code: String(b.code), name: String(b.name) })));

  // Claves naturales de citas, notas y presupuestos ya cargados (para re-importar sin duplicar)
  const appts = appointments as Row[];
  const apptByExt = new Map(appts.filter((x) => x.external_code).map((x) => [norm(String(x.external_code)), x]));
  const apptKey = (patientId: unknown, doctorId: unknown, start: unknown) => `${patientId}|${doctorId}|${String(start).slice(0, 16)}`;
  const apptByTuple = new Map(appts.map((x) => [apptKey(x.patient_id, x.doctor_id, x.start_at), x]));
  const noteRows = notes as Row[];
  const noteByExt = new Map(noteRows.filter((x) => x.external_code).map((x) => [norm(String(x.external_code)), x]));
  const noteKey = (patientId: unknown, date: unknown, bidx: unknown) => `${patientId}|${String(date).slice(0, 10)}|${bidx}`;
  const noteByKey = new Map(noteRows.map((x) => [noteKey(x.patient_id, x.note_date, x.note_bidx), x]));
  const budgetByExt = new Map((budgets as Row[]).map((x) => [norm(String(x.external_code)), x]));

  return {
    tenantId,
    entity,
    statusCode: String(i0.status_code),
    timezone: String(i0.timezone || 'America/Lima'),
    currencyCode: String(i0.currency_code || 'PEN'),
    formMode: i0.patient_form_mode === 'ADVANCED' ? 'ADVANCED' as const : 'STANDARD' as const,
    patientCount: Number(i0.patient_count),
    planMaxPatients: i0.plan_max_patients == null ? null : Number(i0.plan_max_patients),
    implMaxPatients: i0.implementation_max_patients == null ? null : Number(i0.implementation_max_patients),
    masters,
    doctors: drs,
    findDoctor,
    agreements: agreementsCat,
    services: servicesByCode,
    priceLists: priceListsByCode,
    priceItem: (listId: string, serviceId: string) => priceItemMap.get(priceItemKey(listId, serviceId)),
    patients: pts,
    findPatientByDoc: (doc: string | null) => { const b = blindIndex(doc); return b ? byBidx.get(b) ?? null : null; },
    findPatientByHc: findByHc,
    appointments: appts,
    findAppointment: (ext: string | null, patientId: string, doctorId: string, startDb: string) =>
      (ext ? apptByExt.get(norm(ext)) : apptByTuple.get(apptKey(patientId, doctorId, startDb))) ?? null,
    findBudgetByExt: (ext: string) => budgetByExt.get(norm(ext)) ?? null,
    findNote: (ext: string | null, patientId: string, date: string, bidx: string | null) =>
      (ext ? noteByExt.get(norm(ext)) : noteByKey.get(noteKey(patientId, date, bidx))) ?? null,
    findPatientByHcExact: (hc: string) => byHc.get(hc.trim().toUpperCase()) ?? null,
    branches: branchCat,
  };
}
