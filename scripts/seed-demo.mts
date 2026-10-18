/**
 * Datos de ejemplo/pruebas (SOLO staging/desarrollo): clínica demo, doctores, lista de precios, pacientes y un presupuesto.
 * Todo se crea vía stored procedures con el usuario de la app (permiso EXECUTE).
 * Uso: npm run db:seed-demo
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { spRows } from '@/lib/server/db';
import { createTenant, listPlans, listTenants } from '@/lib/server/services/platform';
import { listMasterItems, saveBudget, saveDoctor, savePatient, saveService, type Ctx } from '@/lib/server/services/clinic';
import { createUser } from '@/lib/server/services/users';

if (process.env.APP_ENV === 'production') throw new Error('No se cargan datos demo en producción');

const actor = { userId: null as unknown as string, ip: 'seed' };

const existing = (await listTenants('demo')).find((t) => t.code === 'demo');
if (existing) {
  console.log('La clínica demo ya existe. Nada que hacer.');
  process.exit(0);
}

const plan = (await listPlans()).find((p) => p.code === 'STARTER')!;
const tenant = await createTenant(actor, {
  code: 'demo', legalName: 'Clínica Dental Demo S.A.C.', tradeName: 'Clínica Dental Demo', taxId: '20123456789',
  email: 'contacto@demo.odontosis.pe', phone: '01 555 0000', address: 'Av. Ejemplo 123, Lima', planId: plan.id as string,
  statusCode: 'ACTIVE', maxUsersOverride: null, primaryColor: '#0E7490', secondaryColor: '#F59E0B', currencyCode: 'PEN',
  timezone: 'America/Lima', subscriptionStart: null, subscriptionEnd: null,
  adminEmail: 'admin@demo.odontosis.pe', adminName: 'Administrador Demo',
});
const ctx: Ctx = { tenantId: tenant.id, userId: null as unknown as string, ip: 'seed' };

const masters = await listMasterItems(tenant.id, null);
const m = (table: string, code: string) => masters.find((x) => x.table_code === table && x.code === code)!.id as string;

// Doctores (uno vinculado a un usuario con rol Odontólogo)
const doctorUser = await createUser(tenant.id, actor, { id: randomUUID(), email: 'doctor@demo.odontosis.pe', fullName: 'Dra. Ana Torres', roleCode: 'DOCTOR' });
const recUser = await createUser(tenant.id, actor, { id: randomUUID(), email: 'recepcion@demo.odontosis.pe', fullName: 'Lucía Ramos', roleCode: 'RECEPTIONIST' });
const drAna = randomUUID();
const drLuis = randomUUID();
await saveDoctor(ctx, { id: drAna, userId: doctorUser.id, firstName: 'Ana', lastName: 'Torres', licenseNumber: 'COP 12345', specialtyId: m('SPECIALTY', 'GEN'), email: 'doctor@demo.odontosis.pe', phone: '999 111 222', agendaColor: '#0E7490', isActive: true });
await saveDoctor(ctx, { id: drLuis, userId: null, firstName: 'Luis', lastName: 'Mendoza', licenseNumber: 'COP 23456', specialtyId: m('SPECIALTY', 'IMP'), email: null, phone: '999 333 444', agendaColor: '#7C3AED', isActive: true });

// Lista de precios (modelo Multident) — datos de ejemplo
const S: [string, string, string, number, boolean?][] = [
  ['101', 'EXAMEN CON ODONTOGRAMA', 'DIAG', 50],
  ['102', 'MODELOS DE ESTUDIO PARA ENCERADO DX', 'DIAG', 150],
  ['111', 'PULPECTOMIA', 'PEDI', 300],
  ['112', 'PULPOTOMIA', 'PEDI', 190],
  ['113', 'IONOMERO SIMPLE', 'OPER', 125],
  ['114', 'IONOMERO COMPUESTA', 'OPER', 130],
  ['115', 'IONOMERO COMPLEJA', 'OPER', 145],
  ['116', 'RESINA-IONOMERO REFORZADO-RESINA SIMPLE', 'OPER', 120],
  ['117', 'RESINA-IONOMERO REFORZADO-RESINA MODERADA', 'OPER', 140],
  ['118', 'RESINA-IONOMERO REFORZADO-RESINA COMPLEJA', 'OPER', 155],
  ['119', 'SELLANTES PARA NIÑOS', 'PREV', 50],
  ['120', 'RECUBRIMIENTO PULPAR - DIRECTO', 'OPER', 50],
  ['121', 'EXTRACCION SIMPLE', 'CIRU', 60],
  ['122', 'EXTRACCION COMPLEJA', 'CIRU', 165],
  ['123', 'SEDACION CONSCIENTE POR CITA', 'PEDI', 250],
  ['124', 'MICRO ABRASION', 'OPER', 160],
  ['125', 'CORONA PREFORMADA METAL', 'PEDI', 310, true],
  ['126', 'CORONA CELULOIDE', 'PEDI', 225, true],
  ['127', 'ZAPATILLA DISTAL', 'PEDI', 330, true],
  ['128', 'BANDA ANSA', 'PEDI', 330, true],
  ['129', 'FRENECTOMIA - ODONTOPEDIATRICO', 'CIRU', 450],
  ['130', 'OPERCULECTOMIA - ODONTOPEDIATRICO', 'CIRU', 180],
  ['131', 'IONOMERO PROVISIONAL', 'OPER', 85],
  ['201', 'IMPLANTES DENTALES', 'IMPL', 3500, true],
];
const svc: Record<string, { id: string; price: number; name: string }> = {};
for (const [code, name, cat, price, lab] of S) {
  const id = randomUUID();
  svc[code] = { id, price, name };
  await saveService(ctx, { id, code, name, categoryId: m('SERVICE_CATEGORY', cat), currencyCode: 'PEN', price, requiresLab: !!lab, perPiece: true, isActive: true });
}

// Pacientes de prueba
const pats = [
  { firstName: 'María', lastName: 'Quispe Huamán', docNumber: '45678912', birthDate: '1988-04-12', sex: 'F', phone: '987 654 321', insurance: 'Pacífico Seguros', deductible: 30, coins: 20 },
  { firstName: 'Jorge', lastName: 'Ramírez Soto', docNumber: '41234567', birthDate: '1975-11-02', sex: 'M', phone: '912 345 678', insurance: null, deductible: null, coins: null },
  { firstName: 'Valentina', lastName: 'Flores Díaz', docNumber: '78945612', birthDate: '2016-07-21', sex: 'F', phone: '955 444 333', insurance: 'Rímac', deductible: 25, coins: 10 },
];
const patientIds: string[] = [];
for (const p of pats) {
  const id = randomUUID();
  patientIds.push(id);
  await savePatient(ctx, {
    id, docTypeId: m('DOC_TYPE', 'DNI'), docNumber: p.docNumber, firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate,
    sexId: m('SEX', p.sex), phone: p.phone, email: null, address: null, insuranceCompany: p.insurance, deductible: p.deductible,
    coinsurancePct: p.coins, allergies: null, medicalHistory: null, notes: null, isActive: true,
  });
}

// Presupuesto modelo (como el formato físico)
const item = (code: string, tooth: string | null, surfaces: string | null) => ({
  id: randomUUID(), toothCode: tooth, surfaces, serviceId: svc[code].id, description: svc[code].name, quantity: 1,
  unitPrice: svc[code].price, deductible: 0, coinsurance: 0,
});
await saveBudget(ctx, {
  id: randomUUID(), patientId: patientIds[1], doctorId: drLuis, budgetDate: new Date().toISOString().slice(0, 10), statusCode: 'DRAFT',
  insuranceCompany: null, deductible: 0, coinsurancePct: 0, discount: 0, notes: null,
  items: [item('102', null, null), item('122', '4.5', 'OVLMD'), item('101', null, null), item('201', '4.4', 'OVLMD'), item('201', '4.5', 'OVLMD')],
  marks: [
    { toothCode: '4.5', surface: null, conditionId: m('TOOTH_CONDITION', 'EXTRACTION'), notes: null },
    { toothCode: '4.4', surface: null, conditionId: m('TOOTH_CONDITION', 'IMPLANT'), notes: null },
  ],
}, false);

const counts = await spRows('sp_tenant_usage', [tenant.id]);
console.log('✓ Clínica demo creada', counts[0]);
console.log('  Credenciales temporales (deben cambiarse en el primer ingreso):');
console.log(`  admin@demo.odontosis.pe      ${tenant.tempPassword}`);
console.log(`  doctor@demo.odontosis.pe     ${doctorUser.tempPassword}`);
console.log(`  recepcion@demo.odontosis.pe  ${recUser.tempPassword}`);
process.exit(0);
