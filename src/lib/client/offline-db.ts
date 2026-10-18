'use client';
import Dexie, { type EntityTable } from 'dexie';
import type { SyncOp } from '@/lib/shared/schemas';

/**
 * Base local (IndexedDB) para trabajar sin conexión.
 * Sólo guarda datos mínimos de operación (sin historia clínica) y se borra al cerrar sesión.
 */
export type LPatient = { id: string; record_number: string | null; first_name: string; last_name: string; birth_date: string | null; phone: string | null; insurance_company: string | null; deductible: number | null; coinsurance_pct: number | null; is_active: number; updated_at: string; pending?: boolean;
  requires_guardian?: number; guardian_name?: string | null; guardian_relationship_name?: string | null; guardian_phone?: string | null;
  agreement_id?: string | null; agreement_member_code?: string | null;
  mother_last_name?: string | null; home_branch_id?: string | null; assigned_doctor_id?: string | null; price_list_id?: string | null;
  titular_patient_id?: string | null };
export type LPriceList = { id: string; code: string; name: string; group_name: string | null; branch_id: string | null; is_default: number; is_active: number; updated_at: string };
export type LPriceListItem = { id: string; price_list_id: string; service_id: string; price: number; updated_at: string };
export type LAgreement = { id: string; code: string; name: string; company_name: string | null; discount_pct: number; valid_from: string | null; valid_to: string | null; requires_member_code: number; is_active: number; updated_at: string };
export type LDoctor = { id: string; first_name: string; last_name: string; specialty_id: string | null; agenda_color: string; is_active: number; updated_at: string };
export type LService = { id: string; code: string; name: string; category_id: string | null; currency_symbol: string; price: number; requires_lab: number; per_piece: number; is_active: number; updated_at: string };
export type LBranch = { id: string; code: string; name: string; address: string | null; phone: string | null; is_main: number; is_active: number; patient_form_mode?: string | null; updated_at: string };
export type LAppointment = { id: string; patient_id: string; doctor_id: string; branch_id?: string | null; start_at: string; end_at: string; status_code: string; reason: string | null; notes?: string | null; updated_at: string; pending?: boolean };
export type LBudget = { id: string; budget_number: string | null; patient_id: string; doctor_id: string | null; branch_id?: string | null; budget_date: string; valid_until: string | null; status_code: string; total: number; updated_at: string; pending?: boolean };
export type LMaster = { id: string; table_code: string; code: string; name: string; value: string | null; sort_order: number; is_active: number; updated_at: string };
export type LOutbox = SyncOp & { createdAt: number; status: 'pending' | 'error'; error?: string; label: string };
export type LMeta = { key: string; value: string };

class OfflineDb extends Dexie {
  patients!: EntityTable<LPatient, 'id'>;
  doctors!: EntityTable<LDoctor, 'id'>;
  services!: EntityTable<LService, 'id'>;
  appointments!: EntityTable<LAppointment, 'id'>;
  budgets!: EntityTable<LBudget, 'id'>;
  masters!: EntityTable<LMaster, 'id'>;
  agreements!: EntityTable<LAgreement, 'id'>;
  branches!: EntityTable<LBranch, 'id'>;
  priceLists!: EntityTable<LPriceList, 'id'>;
  priceListItems!: EntityTable<LPriceListItem, 'id'>;
  outbox!: EntityTable<LOutbox, 'opId'>;
  meta!: EntityTable<LMeta, 'key'>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      patients: 'id, last_name, record_number, updated_at',
      doctors: 'id',
      services: 'id, name, code',
      appointments: 'id, start_at, doctor_id, patient_id',
      budgets: 'id, patient_id, budget_date',
      masters: 'id, table_code, [table_code+code]',
      outbox: 'opId, createdAt, status',
      meta: 'key',
    });
    // v2: convenios. Se fuerza una sincronización completa para traer los campos nuevos de pacientes.
    this.version(2).stores({ agreements: 'id, name' }).upgrade((tx) => tx.table('meta').delete('lastSync'));
    // v3: sedes (se fuerza sincronización completa para traer branch_id de citas y presupuestos)
    this.version(3).stores({ branches: 'id, name' }).upgrade((tx) => tx.table('meta').delete('lastSync'));
    // v4: tarifarios + campos de la ficha avanzada
    this.version(4).stores({ priceLists: 'id, name', priceListItems: 'id, price_list_id, [price_list_id+service_id]' })
      .upgrade((tx) => tx.table('meta').delete('lastSync'));
  }
}

let instance: OfflineDb | null = null;
let currentKey = '';

/** Una base por usuario+clínica: los datos de distintos usuarios nunca se mezclan. */
export function localDb(userId: string, tenantId: string) {
  const key = `odontosis-${tenantId}-${userId}`;
  if (!instance || currentKey !== key) {
    instance?.close();
    instance = new OfflineDb(key);
    currentKey = key;
  }
  return instance;
}

export async function wipeLocalData() {
  instance?.close();
  instance = null;
  const names = await Dexie.getDatabaseNames();
  await Promise.all(names.filter((n) => n.startsWith('odontosis-')).map((n) => Dexie.delete(n)));
}

export type { OfflineDb };
