/** Fila de GET /api/ortho-budgets */
export type OrthoBudgetRow = {
  id: string; budget_number: string; budget_date: string; valid_until: string; patient_id: string; patient_name: string;
  record_number: string | null; doctor_name: string | null; status_code: string; status_name: string; status_color: string | null;
  appliance_name: string; estimated_months: number; total_amount: number; net_amount: number; initial_payment: number;
  installments: number; installment_amount: number; last_installment_amount: number; grand_total: number;
  currency_symbol: string; updated_at: string;
};

export type OrthoScheduleRow = { installment_no: number; month_index: number; due_date: string; amount: number };

/** Respuesta de GET /api/ortho-budgets/[id] */
export type OrthoBudgetDetail = {
  id: string; budget_number: string; budget_date: string; valid_until: string; patient_id: string; doctor_id: string | null;
  patient_first_name: string; patient_last_name: string; record_number: string | null; doc_number: string | null; doc_type_code: string | null;
  patient_birth_date: string | null; requires_guardian: number; guardian_name: string | null; guardian_relationship_name: string | null;
  guardian_doc_type_code: string | null; guardian_doc_number: string | null;
  doctor_name: string | null; doctor_license: string | null; status_code: string; status_name: string; status_color: string | null;
  appliance_id: string; appliance_code: string; appliance_name: string; diagnosis: string | null; treatment_plan: string | null;
  estimated_months: number; total_amount: number; agreement_id: string | null; agreement_name: string | null;
  agreement_discount_pct: number; agreement_discount_amount: number; agreement_member_code: string | null;
  net_amount: number; initial_payment: number; installments: number; installment_amount: number; last_installment_amount: number;
  includes_retainers: number; retainer_amount: number; grand_total: number;
  currency_code: string; currency_symbol: string; notes: string | null;
  branch_id: string | null; branch_name: string | null; branch_address: string | null; branch_phone: string | null;
  created_at: string; updated_at: string;
  tenant_name: string; tenant_legal_name: string; tenant_tax_id: string | null; tenant_address: string | null; tenant_phone: string | null;
  tenant_logo_file_id: string | null; tenant_budget_notes: string | null; tenant_status_code: string;
  schedule: OrthoScheduleRow[];
};
