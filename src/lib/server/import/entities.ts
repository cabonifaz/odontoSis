import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { env } from '../env';
import { blindIndex, encrypt } from '../crypto';
import { agreementSchema, budgetSchema, doctorSchema, patientSchema, serviceSchema } from '@/lib/shared/schemas';
import { toDbDateTime, zonedToUtc } from '@/lib/shared/format';
import type { ImportEntity, ImportIssue } from '@/lib/shared/import-spec';
import type { ImportContext, PatientRow } from './context';
import type { ParsedFile } from './parse';
import { norm, RowReader, toothFdi } from './values';

/** Un registro a guardar: puede venir de una o varias filas (p. ej. un presupuesto con sus tratamientos). */
export type Unit = { rows: number[]; isNew: boolean; payload: Record<string, unknown>; kind?: string };
export type Prepared = { units: Unit[]; issues: ImportIssue[]; warnings: ImportIssue[] };
export type PrepareOptions = { canEditBudgets: boolean };

/** Huella de una nota (HMAC con separación de dominio y por clínica, sobre el texto exacto): evita duplicar al re-importar. */
const noteHash = (tenantId: string, text: string) =>
  createHmac('sha256', Buffer.from(env().BLIND_INDEX_KEY, 'base64')).update(`clinical-note:${tenantId}:${text}`).digest('hex');

const bit = (b: boolean) => (b ? 1 : 0);

/** Recorre las filas, acumula errores/advertencias y deja sólo las unidades válidas. */
function collect(file: ParsedFile, fn: (r: RowReader) => Unit | null): Prepared {
  const out: Prepared = { units: [], issues: [], warnings: [] };
  for (const row of file.rows) {
    const r = new RowReader(row);
    const unit = fn(r);
    out.issues.push(...r.issues);
    out.warnings.push(...r.warnings);
    if (unit && r.ok) out.units.push(unit);
  }
  return out;
}

/** Evita registros repetidos dentro del mismo archivo. */
function dupGuard() {
  const seen = new Map<string, number>();
  return (r: RowReader, column: string, key: string | null | undefined, label: string) => {
    if (!key) return;
    const prev = seen.get(key);
    if (prev !== undefined) r.error(column, `${label} repetido en el archivo (fila ${prev})`);
    else seen.set(key, r.row);
  };
}

/** Paciente por N° de documento o N° de H.C. (ya cargado). */
function resolvePatient(r: RowReader, ctx: ImportContext): PatientRow | null {
  const doc = r.str('paciente_documento', { max: 20 });
  const hc = r.str('paciente_hc', { max: 20 });
  if (!doc && !hc) { r.error('paciente_documento', 'Indica paciente_documento o paciente_hc'); return null; }
  const byDoc = doc ? ctx.findPatientByDoc(doc) : null;
  const byHc = hc ? ctx.findPatientByHc(hc) : null;
  if (doc && !byDoc) { r.error('paciente_documento', 'No existe un paciente con ese documento. Cárgalo primero en el paso Pacientes'); return null; }
  if (!doc && !byHc) { r.error('paciente_hc', 'No existe un paciente con esa H.C. Cárgalo primero en el paso Pacientes'); return null; }
  if (byDoc && byHc && byDoc.id !== byHc.id) { r.error('paciente_hc', 'El documento y la H.C. corresponden a pacientes distintos'); return null; }
  return byDoc ?? byHc;
}

function resolveDoctor(r: RowReader, ctx: ImportContext, required: boolean) {
  const v = r.str('doctor', { max: 200, required });
  if (!v) return null;
  const d = ctx.findDoctor(v);
  if (!d) r.error('doctor', 'Doctor no encontrado (usa su código, COP, correo o nombre completo del paso Doctores)');
  return d;
}

// ---------------- 1. Doctores ----------------
function doctors(file: ParsedFile, ctx: ImportContext): Prepared {
  const dup = dupGuard();
  const cat = ctx.masters.SPECIALTY;
  const find = (pred: (d: ImportContext['doctors'][number]) => boolean) => ctx.doctors.find(pred) ?? null;
  return collect(file, (r) => {
    const code = r.str('codigo', { max: 30 });
    const firstName = r.str('nombres', { required: true, max: 100 });
    const lastName = r.str('apellidos', { required: true, max: 100 });
    const cop = r.str('cop', { max: 30 });
    const spec = r.str('especialidad', { max: 150 });
    const email = r.str('correo', { max: 200 })?.toLowerCase() ?? null;
    const phone = r.str('telefono', { max: 40 });
    const birthDate = r.date('fecha_nacimiento');
    const color = r.str('color_agenda', { max: 7 });
    const isActive = r.bool('activo', true);
    const specialty = spec ? cat.find(spec) : null;
    if (spec && !specialty) r.error('especialidad', `Especialidad no encontrada. Valores: ${cat.names()}`);
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) r.error('color_agenda', 'Color inválido (usa #RRGGBB)');
    const fullName = norm(`${firstName} ${lastName}`);
    dup(r, 'codigo', code ? `C:${norm(code)}` : null, 'Código');
    dup(r, 'cop', cop ? `L:${norm(cop)}` : null, 'COP');
    dup(r, 'correo', email ? `E:${email}` : null, 'Correo');
    if (!code && !cop && !email) dup(r, 'nombres', `N:${fullName}`, 'Doctor');
    const existing = (code && find((d) => norm(d.code) === norm(code)))
      || (cop && find((d) => norm(d.license_number) === norm(cop)))
      || (email && find((d) => d.email?.toLowerCase() === email))
      || find((d) => norm(`${d.first_name} ${d.last_name}`) === fullName);
    const id = existing ? existing.id : randomUUID();
    if (!r.ok) return null;
    const v = doctorSchema.safeParse({
      id, userId: null, firstName, lastName, licenseNumber: cop ?? existing?.license_number ?? null, specialtyId: specialty?.id ?? existing?.specialty_id ?? null,
      email: email ?? existing?.email ?? null, phone, agendaColor: color ?? existing?.agenda_color ?? '#0E7490', birthDate: birthDate ?? existing?.birth_date?.slice(0, 10) ?? null, isActive,
    });
    if (!v.success) { r.zod(v.error, { firstName: 'nombres', lastName: 'apellidos', licenseNumber: 'cop', email: 'correo', phone: 'telefono', agendaColor: 'color_agenda', birthDate: 'fecha_nacimiento' }); return null; }
    const d = v.data;
    return {
      rows: [r.row], isNew: !existing,
      payload: { id, code, firstName: d.firstName, lastName: d.lastName, licenseNumber: d.licenseNumber, specialtyId: d.specialtyId,
        email: d.email, phoneEnc: phone ? encrypt(phone) : existing?.phone_enc ?? null, agendaColor: d.agendaColor, isActive: bit(d.isActive), birthDate: d.birthDate },
    };
  });
}

// ---------------- 2. Convenios ----------------
function agreements(file: ParsedFile, ctx: ImportContext): Prepared {
  const dup = dupGuard();
  return collect(file, (r) => {
    const code = r.str('codigo', { required: true, max: 30 });
    const name = r.str('nombre', { required: true, max: 150 });
    const companyName = r.str('empresa', { max: 200 });
    const discountPct = r.num('descuento_pct', { required: true, min: 0, max: 100 });
    const validFrom = r.date('vigencia_desde');
    const validTo = r.date('vigencia_hasta');
    const requiresMemberCode = r.bool('exige_n_socio', false);
    const notes = r.str('notas', { max: 500 });
    const isActive = r.bool('activo', true);
    dup(r, 'codigo', code ? norm(code) : null, 'Código');
    const existing = code ? ctx.agreements.items.find((a) => norm(a.code) === norm(code)) : null;
    const id = existing?.id ?? randomUUID();
    if (!r.ok) return null;
    const v = agreementSchema.safeParse({ id, code, name, companyName, discountPct, validFrom, validTo, requiresMemberCode, notes, isActive });
    if (!v.success) { r.zod(v.error, { code: 'codigo', name: 'nombre', discountPct: 'descuento_pct', validTo: 'vigencia_hasta', validFrom: 'vigencia_desde' }); return null; }
    const a = v.data;
    return { rows: [r.row], isNew: !existing, payload: { ...a, requiresMemberCode: bit(a.requiresMemberCode), isActive: bit(a.isActive) } };
  });
}

// ---------------- 3a. Servicios ----------------
function services(file: ParsedFile, ctx: ImportContext): Prepared {
  const dup = dupGuard();
  const cat = ctx.masters.SERVICE_CATEGORY;
  const newCats = new Set<string>();
  return collect(file, (r) => {
    const code = r.str('codigo', { required: true, max: 20 });
    const name = r.str('nombre', { required: true, max: 200 });
    const category = r.str('categoria', { max: 150 });
    const price = r.num('precio_base', { required: true, min: 0, max: 9_999_999 });
    const currency = (r.str('moneda') ?? ctx.currencyCode).toUpperCase();
    const requiresLab = r.bool('requiere_laboratorio', false);
    const perPiece = r.bool('por_pieza', true);
    const isActive = r.bool('activo', true);
    if (!['PEN', 'USD'].includes(currency)) r.error('moneda', 'Usa PEN o USD');
    dup(r, 'codigo', code ? norm(code) : null, 'Código');
    const found = category ? cat.find(category) : null;
    if (category && !found && !newCats.has(norm(category))) {
      newCats.add(norm(category));
      r.warn('categoria', `Se creará la categoría «${category}»`);
    }
    const existing = code ? ctx.services.get(norm(code)) : null;
    const id = existing?.id ?? randomUUID();
    if (!r.ok) return null;
    const v = serviceSchema.safeParse({ id, code, name, categoryId: found?.id ?? null, currencyCode: currency, price, requiresLab, perPiece, isActive });
    if (!v.success) { r.zod(v.error, { code: 'codigo', name: 'nombre', price: 'precio_base', currencyCode: 'moneda' }); return null; }
    const s = v.data;
    return {
      rows: [r.row], isNew: !existing,
      payload: { ...s, categoryName: found ? null : category, requiresLab: bit(s.requiresLab), perPiece: bit(s.perPiece), isActive: bit(s.isActive) },
    };
  });
}

// ---------------- 3b. Precios por tarifario ----------------
function priceListItems(file: ParsedFile, ctx: ImportContext): Prepared {
  const dup = dupGuard();
  const newLists = new Map<string, string | null>();
  return collect(file, (r) => {
    const listCode = r.str('codigo_tarifario', { required: true, max: 30 })?.toUpperCase() ?? null;
    const listName = r.str('nombre_tarifario', { max: 120 });
    const group = r.str('grupo', { max: 120 });
    const serviceCode = r.str('codigo_servicio', { required: true, max: 20 });
    const price = r.num('precio', { required: true, min: 0, max: 9_999_999 });
    if (listCode && !/^[A-Za-z0-9_-]+$/.test(listCode)) r.error('codigo_tarifario', 'Sólo letras, números, guion y guion bajo');
    const service = serviceCode ? ctx.services.get(norm(serviceCode)) : null;
    if (serviceCode && !service) r.error('codigo_servicio', 'Servicio no encontrado. Cárgalo primero en Lista de precios');
    const list = listCode ? ctx.priceLists.get(norm(listCode)) : null;
    if (listCode && !list) {
      if (!newLists.has(listCode)) {
        if (!listName) r.error('nombre_tarifario', 'El tarifario no existe: indica su nombre para crearlo');
        else { newLists.set(listCode, listName); r.warn('codigo_tarifario', `Se creará el tarifario «${listName}» (${listCode})`); }
      }
    }
    dup(r, 'codigo_servicio', listCode && serviceCode ? `${listCode}|${norm(serviceCode)}` : null, 'Servicio del tarifario');
    if (!r.ok || !listCode || !service || price === null) return null;
    return {
      rows: [r.row], isNew: !list || ctx.priceItem(list.id, service.id) === undefined,
      payload: { priceListCode: listCode, priceListName: listName ?? newLists.get(listCode) ?? null, groupName: group, serviceId: service.id, price },
    };
  });
}

// ---------------- 4. Pacientes ----------------
const PATIENT_COLUMNS: Record<string, string> = {
  docNumber: 'numero_documento', firstName: 'nombres', lastName: 'apellido_paterno', motherLastName: 'apellido_materno', birthDate: 'fecha_nacimiento',
  phone: 'telefono', mobile: 'celular', email: 'correo', address: 'direccion', insuranceCompany: 'aseguradora', allergies: 'alergias',
  medicalHistory: 'antecedentes', notes: 'notas', guardianName: 'apoderado_nombre', guardianRelationshipId: 'apoderado_parentesco',
  guardianDocNumber: 'apoderado_documento', guardianPhone: 'apoderado_telefono', agreementMemberCode: 'n_socio',
};

function patients(file: ParsedFile, ctx: ImportContext): Prepared {
  const M = ctx.masters;
  const dupDoc = dupGuard();
  const dupHc = dupGuard();
  const fileByBidx = new Map<string, string>();
  const newAgreements = new Set<string>();
  const titularRefs: { unit: Unit; r: RowReader; doc: string }[] = [];
  const dni = M.DOC_TYPE.find('DNI');

  const out = collect(file, (r) => {
    const hc = r.str('hc', { max: 20 });
    const docTypeRaw = r.str('tipo_documento', { max: 30 });
    let docNumber = r.str('numero_documento', { max: 20 });
    const firstName = r.str('nombres', { required: true, max: 100 });
    const paternal = r.str('apellido_paterno', { required: true, max: 100 });
    const maternal = r.str('apellido_materno', { max: 100 });
    const birthDate = r.date('fecha_nacimiento');
    const sexRaw = r.str('sexo', { max: 20 });
    const mobile = r.str('celular', { max: 40 });
    const phone = r.str('telefono', { max: 40 });
    const email = r.str('correo', { max: 200 });
    const address = r.str('direccion', { max: 300 });
    const districtRaw = r.str('distrito_ubigeo', { max: 6 });
    const insurance = r.str('aseguradora', { max: 150 });
    const agreementRaw = r.str('convenio', { max: 150 });
    const memberCode = r.str('n_socio', { max: 40 });
    const priceListRaw = r.str('tarifario', { max: 30 });
    const titularDoc = r.str('titular_documento', { max: 20 });
    const titularRelRaw = r.str('titular_parentesco', { max: 60 });
    const guardianName = r.str('apoderado_nombre', { max: 200 });
    const guardianRelRaw = r.str('apoderado_parentesco', { max: 60 });
    const guardianDocTypeRaw = r.str('apoderado_tipo_documento', { max: 30 });
    const guardianDoc = r.str('apoderado_documento', { max: 20 });
    const guardianPhone = r.str('apoderado_telefono', { max: 40 });
    const allergies = r.str('alergias', { max: 2000 });
    const medicalHistory = r.str('antecedentes', { max: 5000 });
    const notes = r.str('notas', { max: 2000 });
    const isActive = r.bool('activo', true);

    // Catálogos
    const docType = docTypeRaw ? M.DOC_TYPE.find(docTypeRaw) : docNumber ? dni : null;
    if (docTypeRaw && !docType) r.error('tipo_documento', `Tipo de documento no válido. Valores: ${M.DOC_TYPE.items.map((i) => i.code).join(', ')}`);
    if (docType?.code === 'DNI' && docNumber) {
      const digits = docNumber.replace(/\D/g, '');
      if (/^\d{6,7}$/.test(digits) && digits === docNumber) {
        docNumber = digits.padStart(8, '0');
        r.warn('numero_documento', `DNI completado con ceros a la izquierda: ${docNumber}`);
      }
      if (!/^\d{8}$/.test(docNumber)) r.error('numero_documento', 'El DNI debe tener 8 dígitos');
    }
    const sexAlias: Record<string, string> = { MUJER: 'F', HOMBRE: 'M', FEMENINO: 'F', MASCULINO: 'M' };
    const sex = sexRaw ? M.SEX.find(sexAlias[norm(sexRaw)] ?? sexRaw) : null;
    if (sexRaw && !sex) r.error('sexo', 'Usa F, M o X');
    const district = districtRaw ? M.UBIGEO_DISTRICT.items.find((d) => d.code === districtRaw) ?? null : null;
    if (districtRaw && !district) r.error('distrito_ubigeo', 'Código de ubigeo no encontrado (6 dígitos INEI, p. ej. 150131)');
    const guardianRel = guardianRelRaw ? M.GUARDIAN_RELATIONSHIP.find(guardianRelRaw) : null;
    if (guardianRelRaw && !guardianRel) r.error('apoderado_parentesco', `Parentesco no válido. Valores: ${M.GUARDIAN_RELATIONSHIP.names()}`);
    const guardianDocType = guardianDocTypeRaw ? M.DOC_TYPE.find(guardianDocTypeRaw) : guardianDoc ? dni : null;
    if (guardianDocTypeRaw && !guardianDocType) r.error('apoderado_tipo_documento', 'Tipo de documento no válido');
    const titularRel = titularRelRaw ? M.GUARDIAN_RELATIONSHIP.find(titularRelRaw) : null;
    if (titularRelRaw && !titularRel) r.error('titular_parentesco', `Parentesco no válido. Valores: ${M.GUARDIAN_RELATIONSHIP.names()}`);
    const agreement = agreementRaw ? ctx.agreements.find(agreementRaw) : null;
    if (agreementRaw && !agreement && !newAgreements.has(norm(agreementRaw))) {
      newAgreements.add(norm(agreementRaw));
      r.warn('convenio', `Se creará el convenio «${agreementRaw}» con 0 % de descuento`);
    }
    const priceList = priceListRaw ? ctx.priceLists.get(norm(priceListRaw)) : null;
    if (priceListRaw && !priceList) r.error('tarifario', 'Tarifario no encontrado. Cárgalo primero en Precios por tarifario');

    // Paciente existente: por documento, si no por H.C.
    const bidx = blindIndex(docNumber);
    dupDoc(r, 'numero_documento', bidx, 'Documento');
    dupHc(r, 'hc', hc?.toUpperCase(), 'N° de H.C.');
    const byDoc = docNumber ? ctx.findPatientByDoc(docNumber) : null;
    const byHc = hc ? ctx.findPatientByHcExact(hc) : null;
    let existing: PatientRow | null = byDoc;
    if (byDoc && byHc && byDoc.id !== byHc.id) r.error('hc', 'Esa H.C. ya pertenece a otro paciente');
    if (!byDoc && byHc) {
      if (bidx && byHc.doc_number_bidx && byHc.doc_number_bidx !== bidx) r.error('hc', 'Esa H.C. ya pertenece a otro paciente (con otro documento)');
      else existing = byHc;
    }
    const id = existing?.id ?? randomUUID();
    if (bidx) fileByBidx.set(bidx, id);

    // Ficha estándar: un solo campo "Apellidos"; avanzada: paterno y materno por separado
    const lastName = ctx.formMode === 'ADVANCED' ? paternal : [paternal, maternal].filter(Boolean).join(' ');
    const motherLastName = ctx.formMode === 'ADVANCED' ? maternal : null;
    if (!r.ok) return null;
    const v = patientSchema.safeParse({
      id, docTypeId: docType?.id ?? null, docNumber, firstName, lastName, birthDate, sexId: sex?.id ?? null, phone, email, address,
      insuranceCompany: insurance, allergies, medicalHistory, notes, isActive,
      requiresGuardian: !!guardianName, guardianName, guardianRelationshipId: guardianRel?.id ?? null,
      guardianDocTypeId: guardianDocType?.id ?? null, guardianDocNumber: guardianDoc, guardianPhone,
      agreementId: agreement?.id ?? null, agreementName: agreement ? null : agreementRaw, agreementMemberCode: memberCode,
      formMode: 'STANDARD', motherLastName, mobile, districtId: district?.id ?? null, priceListId: priceList?.id ?? null,
    });
    if (!v.success) { r.zod(v.error, PATIENT_COLUMNS); return null; }
    if (!r.ok) return null;
    const p = v.data;
    const unit: Unit = {
      rows: [r.row], isNew: !existing,
      payload: {
        id, recordNumber: hc, docTypeId: p.docTypeId, docNumberEnc: encrypt(p.docNumber), docNumberBidx: blindIndex(p.docNumber),
        firstName: p.firstName, lastName: p.lastName, motherLastName: p.motherLastName, birthDate: p.birthDate, sexId: p.sexId,
        phoneEnc: encrypt(p.phone), mobileEnc: encrypt(p.mobile), emailEnc: encrypt(p.email), addressEnc: encrypt(p.address),
        districtId: p.districtId, insuranceCompany: p.insuranceCompany, allergiesEnc: encrypt(p.allergies),
        medicalHistoryEnc: encrypt(p.medicalHistory), notesEnc: encrypt(p.notes), isActive: bit(p.isActive),
        requiresGuardian: bit(p.requiresGuardian), guardianName: p.guardianName, guardianRelationshipId: p.guardianRelationshipId,
        guardianDocTypeId: p.guardianDocTypeId, guardianDocNumberEnc: encrypt(p.guardianDocNumber), guardianPhoneEnc: encrypt(p.guardianPhone),
        agreementId: p.agreementId, agreementName: p.agreementName, agreementMemberCode: p.agreementMemberCode, priceListId: p.priceListId,
        titularRelationshipId: titularRel?.id ?? null,
      },
    };
    if (titularDoc) titularRefs.push({ unit, r, doc: titularDoc });
    return unit;
  });

  // Titular: otro paciente ya cargado o del mismo archivo
  for (const t of titularRefs) {
    const b = blindIndex(t.doc);
    const titularId = (b && fileByBidx.get(b)) || ctx.findPatientByDoc(t.doc)?.id || null;
    let msg: string | null = null;
    if (!titularId) msg = 'No se encontró el titular con ese documento (ni en el archivo ni en la clínica)';
    else if (titularId === t.unit.payload.id) msg = 'El titular no puede ser el mismo paciente';
    if (msg) {
      out.issues.push({ row: t.r.row, column: 'titular_documento', message: msg });
      out.units = out.units.filter((u) => u !== t.unit);
    } else t.unit.payload.titularPatientId = titularId;
  }

  // Límite de pacientes (plan y periodo de implementación)
  const limits = [ctx.planMaxPatients, ctx.statusCode === 'IMPLEMENTATION' ? ctx.implMaxPatients : null].filter((x): x is number => x !== null);
  if (limits.length) {
    const max = Math.min(...limits);
    let room = Math.max(0, max - ctx.patientCount);
    const keep: Unit[] = [];
    for (const u of out.units) {
      if (!u.isNew) { keep.push(u); continue; }
      if (room > 0) { room--; keep.push(u); continue; }
      out.issues.push({ row: u.rows[0], column: null, message: `Supera el máximo de pacientes permitido (${max}). La clínica ya tiene ${ctx.patientCount}.` });
    }
    out.units = keep;
  }
  return out;
}

// ---------------- 5. Historias clínicas ----------------
function clinicalNotes(file: ParsedFile, ctx: ImportContext): Prepared {
  const dup = dupGuard();
  const patientUpdates = new Map<string, Unit>();
  const out = collect(file, (r) => {
    const patient = resolvePatient(r, ctx);
    const doctor = resolveDoctor(r, ctx, false);
    const note = r.str('nota', { max: 20_000 });
    const date = r.date('fecha', { required: !!note });
    const background = r.str('antecedentes', { max: 5000 });
    const allergies = r.str('alergias', { max: 2000 });
    const ext = r.str('codigo_externo', { max: 40 });
    if (!note && !background && !allergies) r.error('nota', 'La fila no tiene nota, antecedentes ni alergias');
    if (!r.ok || !patient) return null;
    if (background || allergies) {
      const u = patientUpdates.get(patient.id) ?? { rows: [], isNew: false, kind: 'patient', payload: { patientId: patient.id } };
      u.rows.push(r.row);
      if (background) u.payload.medicalHistoryEnc = encrypt(background);
      if (allergies) u.payload.allergiesEnc = encrypt(allergies);
      patientUpdates.set(patient.id, u);
    }
    if (!note || !date) return null;
    const noteBidx = noteHash(ctx.tenantId, note);
    dup(r, ext ? 'codigo_externo' : 'nota', ext ? `X:${norm(ext)}` : `${patient.id}|${date}|${noteBidx}`, ext ? 'Código externo' : 'Nota');
    if (!r.ok) return null;
    const existing = ctx.findNote(ext, patient.id, date, noteBidx);
    return {
      rows: [r.row], isNew: !existing, kind: 'note',
      payload: { id: existing ? String(existing.id) : randomUUID(), patientId: patient.id, noteDate: date, doctorId: doctor?.id ?? null,
        noteEnc: encrypt(note), noteBidx, externalCode: ext },
    };
  });
  // Las filas que sólo traen antecedentes cuentan como actualización del paciente
  out.units.push(...patientUpdates.values());
  return out;
}

// ---------------- 6. Citas ----------------
function appointments(file: ParsedFile, ctx: ImportContext): Prepared {
  const dup = dupGuard();
  const statuses = ctx.masters.APPOINTMENT_STATUS;
  const now = Date.now();
  const inactive = (s: string) => s === 'CANCELLED' || s === 'NO_SHOW';
  // Agenda futura por doctor (para la regla de choques de citas futuras)
  const busy = new Map<string, { id: string; start: number; end: number }[]>();
  const pushBusy = (doctorId: string, x: { id: string; start: number; end: number }) => {
    const list = busy.get(doctorId);
    if (list) list.push(x); else busy.set(doctorId, [x]);
  };
  const parse = (v: unknown) => Date.parse(String(v).replace(' ', 'T') + (String(v).endsWith('Z') ? '' : 'Z'));
  for (const a of ctx.appointments) {
    const end = parse(a.end_at);
    if (end > now && !inactive(String(a.status_code))) pushBusy(String(a.doctor_id), { id: String(a.id), start: parse(a.start_at), end });
  }
  const pending: { r: RowReader; unit: Unit; start: number; end: number; doctorId: string; check: boolean }[] = [];

  const out = collect(file, (r) => {
    const ext = r.str('codigo_externo', { max: 40 });
    const patient = resolvePatient(r, ctx);
    const doctor = resolveDoctor(r, ctx, true);
    const date = r.date('fecha', { required: true });
    const time = r.time('hora_inicio', { required: true });
    const duration = r.num('duracion_min', { min: 5, max: 600, int: true }) ?? 30;
    const statusRaw = r.str('estado', { max: 40 });
    const reason = r.str('motivo', { max: 250 });
    const notes = r.str('notas', { max: 2000 });
    const branchRaw = r.str('sede', { max: 120 });
    const branch = branchRaw ? ctx.branches.find(branchRaw) : null;
    if (branchRaw && !branch) r.error('sede', 'Sede no encontrada o inactiva');
    const status = statusRaw ? statuses.find(statusRaw) : null;
    if (statusRaw && !status) r.error('estado', `Estado no válido. Valores: ${statuses.names()}`);
    dup(r, 'codigo_externo', ext ? norm(ext) : null, 'Código externo');
    if (!r.ok || !patient || !doctor || !date || !time) return null;
    const start = zonedToUtc(date, time, ctx.timezone);
    const end = new Date(start.getTime() + duration * 60_000);
    const statusCode = status?.code ?? (start.getTime() < now ? 'ATTENDED' : 'SCHEDULED');
    const startDb = toDbDateTime(start);
    dup(r, 'hora_inicio', ext ? null : `${patient.id}|${doctor.id}|${startDb}`, 'Cita (mismo paciente, doctor y hora)');
    if (!r.ok) return null;
    const existing = ctx.findAppointment(ext, patient.id, doctor.id, startDb);
    const unit: Unit = {
      rows: [r.row], isNew: !existing,
      payload: { id: existing ? String(existing.id) : randomUUID(), patientId: patient.id, doctorId: doctor.id, branchId: branch?.id ?? null,
        startAt: startDb, endAt: toDbDateTime(end), statusCode, reason, notes, externalCode: ext },
    };
    pending.push({ r, unit, start: start.getTime(), end: end.getTime(), doctorId: doctor.id, check: start.getTime() >= now && !inactive(statusCode) });
    return unit;
  });

  // Choques: sólo citas futuras activas (las pasadas se cargan como historial aunque se crucen)
  const updatedIds = new Set(out.units.map((u) => String(u.payload.id)));
  for (const [k, list] of busy) busy.set(k, list.filter((x) => !updatedIds.has(x.id)));
  const rejected = new Set<Unit>();
  for (const p of pending) {
    if (!p.check) continue;
    const clash = (busy.get(p.doctorId) ?? []).some((x) => x.start < p.end && x.end > p.start);
    if (clash) {
      out.issues.push({ row: p.r.row, column: 'hora_inicio', message: 'El doctor ya tiene una cita en ese horario' });
      rejected.add(p.unit);
    } else pushBusy(p.doctorId, { id: String(p.unit.payload.id), start: p.start, end: p.end });
  }
  out.units = out.units.filter((u) => !rejected.has(u));
  return out;
}

// ---------------- 7. Presupuestos ----------------
function budgets(file: ParsedFile, ctx: ImportContext, opts: PrepareOptions): Prepared {
  const statuses = ctx.masters.BUDGET_STATUS;
  const statusAlias: Record<string, string> = { ENVIADO: 'SENT', PENDIENTE: 'DRAFT' };
  const out: Prepared = { units: [], issues: [], warnings: [] };
  type Group = { code: string; readers: RowReader[]; items: Record<string, unknown>[]; head: Record<string, unknown> | null; patientKey: string; date: string | null; skip?: string };
  const groups = new Map<string, Group>();

  for (const row of file.rows) {
    const r = new RowReader(row);
    const ext = r.str('codigo_externo', { required: true, max: 40 });
    if (!ext) { out.issues.push(...r.issues); continue; }
    const key = norm(ext);
    let g = groups.get(key);
    const first = !g;
    if (!g) { g = { code: ext, readers: [], items: [], head: null, patientKey: '', date: null }; groups.set(key, g); }
    g.readers.push(r);

    const patientKey = `${r.str('paciente_documento') ?? ''}|${r.str('paciente_hc') ?? ''}`;
    const date = r.date('fecha', { required: first });
    if (first) {
      const patient = resolvePatient(r, ctx);
      const doctor = resolveDoctor(r, ctx, false);
      const statusRaw = r.str('estado', { max: 40 });
      const status = statusRaw ? statuses.find(statusAlias[norm(statusRaw)] ?? statusRaw) : null;
      if (statusRaw && !status) r.error('estado', `Estado no válido. Valores: ${statuses.names()}`);
      const listRaw = r.str('tarifario', { max: 30 });
      const list = listRaw ? ctx.priceLists.get(norm(listRaw)) : null;
      if (listRaw && !list) r.error('tarifario', 'Tarifario no encontrado');
      const discount = r.num('descuento', { min: 0, max: 9_999_999 }) ?? 0;
      const notes = r.str('notas', { max: 2000 });
      g.patientKey = patientKey; g.date = date;
      if (patient) {
        const existing = ctx.findBudgetByExt(ext);
        if (existing && existing.status_code === 'DRAFT' && !opts.canEditBudgets) r.error('codigo_externo', 'El presupuesto ya existe y no tienes permiso para modificar presupuestos guardados (budgets.edit)');
        // Un presupuesto ya emitido (no borrador) no se modifica al re-importar
        if (existing && existing.status_code !== 'DRAFT') g.skip = String(existing.status_name ?? existing.status_code);
        // Sin budgets.edit sólo se crean borradores (misma regla que sp_budget_save)
        if (!existing && !opts.canEditBudgets && status && status.code !== 'DRAFT') {
          r.warn('estado', 'No tienes permiso para emitir presupuestos (budgets.edit): se guardará como Borrador');
        }
        g.head = {
          id: existing ? String(existing.id) : randomUUID(), isNew: !existing, patientId: patient.id, doctorId: doctor?.id ?? null,
          budgetDate: date, statusCode: status?.code ?? 'DRAFT', discount, notes, externalCode: ext,
          priceListId: list?.id ?? patient.price_list_id ?? null,
        };
      }
    } else {
      if ((patientKey !== '|' && patientKey !== g.patientKey) || (date && date !== g.date)) {
        r.error('codigo_externo', `Las filas del presupuesto ${ext} deben tener el mismo paciente y fecha`);
      }
    }

    // Tratamiento
    const serviceCode = r.str('codigo_servicio', { max: 20 });
    const description = r.str('descripcion', { max: 250 });
    const toothRaw = r.str('pieza', { max: 5 });
    const surfacesRaw = r.str('superficies', { max: 10 });
    const quantity = r.num('cantidad', { min: 0.01, max: 999 }) ?? 1;
    const unitPriceRaw = r.num('precio_unitario', { min: 0, max: 9_999_999 });
    const service = serviceCode ? ctx.services.get(norm(serviceCode)) : null;
    if (serviceCode && !service) r.error('codigo_servicio', 'Servicio no encontrado. Cárgalo primero en Lista de precios');
    if (!serviceCode && (!description || unitPriceRaw === null)) r.error('codigo_servicio', 'Indica el código del servicio, o la descripción y el precio unitario');
    const tooth = toothFdi(toothRaw);
    if (tooth === false) r.error('pieza', 'Pieza FDI inválida (p. ej. 1.6 o 16)');
    const surfaces = surfacesRaw ? [...new Set(surfacesRaw.toUpperCase().replace(/[^A-Z]/g, ''))].join('') : null;
    if (surfaces && !/^[OVLMD]{1,5}$/.test(surfaces)) r.error('superficies', 'Usa sólo las letras O, V, L, M, D');
    if (surfaces && !tooth) r.error('superficies', 'Indica la pieza para las superficies');
    const listId = (g.head?.priceListId as string | null) ?? null;
    const unitPrice = unitPriceRaw ?? (service ? (listId ? ctx.priceItem(listId, service.id) : undefined) ?? service.price : 0);
    g.items.push({
      id: randomUUID(), toothCode: tooth || null, surfaces: surfaces || null, serviceId: service?.id ?? null,
      description: description ?? service?.name ?? '', quantity, unitPrice, deductible: 0, coinsurance: 0,
    });
  }

  for (const g of groups.values()) {
    if (g.skip && g.readers.every((r) => r.ok)) {
      for (const r of g.readers) out.warnings.push(...r.warnings);
      out.warnings.push({ row: g.readers[0].row, column: 'codigo_externo', message: `Presupuesto ${g.code} ya emitido (${g.skip}): no se modifica` });
      continue;
    }
    const bad = g.readers.some((r) => !r.ok) || !g.head;
    if (g.items.length > 200) g.readers[0].error('codigo_externo', 'Un presupuesto admite hasta 200 tratamientos');
    let parsed: ReturnType<typeof budgetSchema.safeParse> | null = null;
    if (!bad && g.readers[0].ok) {
      parsed = budgetSchema.safeParse({ ...g.head, items: g.items, marks: [] });
      if (!parsed.success) g.readers[0].zod(parsed.error, { budgetDate: 'fecha', discount: 'descuento', notes: 'notas' });
    }
    const failed = g.readers.some((r) => !r.ok);
    for (const r of g.readers) {
      out.issues.push(...r.issues);
      out.warnings.push(...r.warnings);
      if (failed && r.ok) out.issues.push({ row: r.row, column: 'codigo_externo', message: `Presupuesto ${g.code} omitido: corrige los errores de sus otras filas` });
    }
    if (failed || !g.head) continue;
    const { isNew, ...head } = g.head;
    out.units.push({ rows: g.readers.map((r) => r.row), isNew: !!isNew, payload: { ...head, items: g.items } });
  }
  return out;
}

export const PROCESSORS: Record<ImportEntity, { prepare: (f: ParsedFile, c: ImportContext, o: PrepareOptions) => Prepared; sp: string; chunk: number }> = {
  DOCTORS: { prepare: doctors, sp: 'sp_import_doctors', chunk: 500 },
  AGREEMENTS: { prepare: agreements, sp: 'sp_import_agreements', chunk: 500 },
  SERVICES: { prepare: services, sp: 'sp_import_services', chunk: 500 },
  PRICE_LIST_ITEMS: { prepare: priceListItems, sp: 'sp_import_price_list_items', chunk: 1000 },
  PATIENTS: { prepare: patients, sp: 'sp_import_patients', chunk: 500 },
  CLINICAL_NOTES: { prepare: clinicalNotes, sp: 'sp_import_clinical_notes', chunk: 500 },
  APPOINTMENTS: { prepare: appointments, sp: 'sp_import_appointments', chunk: 1000 },
  BUDGETS: { prepare: budgets, sp: 'sp_import_budgets', chunk: 100 },
};
