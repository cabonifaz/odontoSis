/** Respuesta de GET /api/budgets/[id] */
export type BudgetDetail = {
  id: string; budget_number: string; budget_date: string; valid_until: string; patient_id: string; doctor_id: string | null;
  patient_first_name: string; patient_last_name: string; record_number: string; doc_number: string | null; doc_type_code: string | null;
  patient_birth_date: string | null; requires_guardian: number; guardian_name: string | null; guardian_relationship_name: string | null;
  guardian_doc_type_code: string | null; guardian_doc_number: string | null;
  doctor_name: string | null; doctor_license: string | null; status_code: string; status_name: string; status_color: string;
  currency_code: string; currency_symbol: string; insurance_company: string | null; deductible: number; coinsurance_pct: number;
  subtotal: number; discount: number; total: number; notes: string | null; created_at: string; updated_at: string;
  branch_id: string | null; branch_name: string | null; branch_address: string | null; branch_phone: string | null;
  agreement_id: string | null; agreement_name: string | null; agreement_discount_pct: number; agreement_member_code: string | null;
  tenant_name: string; tenant_legal_name: string; tenant_tax_id: string | null; tenant_address: string | null; tenant_phone: string | null;
  tenant_logo_file_id: string | null; tenant_budget_notes: string | null; tenant_status_code: string;
  items: { id: string; tooth_code: string | null; surfaces: string | null; service_id: string | null; description: string; quantity: number; unit_price: number; deductible: number; coinsurance: number; total: number }[];
  marks: { id: string; tooth_code: string; surface: 'O' | 'V' | 'L' | 'M' | 'D' | null; condition_id: string; condition_code: string }[];
};
