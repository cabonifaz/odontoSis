-- =====================================================================
-- V014 - Presupuesto de ortodoncia
--   * Catálogo ORTHO_APPLIANCE (tipo de aparatología, editable por la clínica)
--   * Tabla ortho_budget: correlativo propio (secuencia 'ORTHO_BUDGET'), plan de pagos
--     (cuota inicial + N cuotas mensuales), contención y copia del convenio vigente.
--   Los montos (descuento, neto, cuotas) se calculan SIEMPRE en el SP.
-- =====================================================================

INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'ORTHO_APPLIANCE', 'Aparatología de ortodoncia', 'Tipo de aparato del presupuesto de ortodoncia', 1, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, NULL, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'ORTHO_APPLIANCE' t, 'METAL' code, 'Brackets metálicos' name, 1 ord UNION ALL
    SELECT 'ORTHO_APPLIANCE', 'AESTHETIC', 'Brackets estéticos (cerámica/zafiro)', 2 UNION ALL
    SELECT 'ORTHO_APPLIANCE', 'SELF_LIGATING', 'Brackets de autoligado', 3 UNION ALL
    SELECT 'ORTHO_APPLIANCE', 'ALIGNERS', 'Alineadores invisibles', 4 UNION ALL
    SELECT 'ORTHO_APPLIANCE', 'REMOVABLE', 'Aparato removible', 5 UNION ALL
    SELECT 'ORTHO_APPLIANCE', 'OTHER', 'Otro', 6
  ) v ON v.t = mt.code;

CREATE TABLE ortho_budget (
  id                        CHAR(36)      NOT NULL,
  tenant_id                 CHAR(36)      NOT NULL,
  budget_number             VARCHAR(20)   NOT NULL,          -- correlativo propio (secuencia ORTHO_BUDGET)
  patient_id                CHAR(36)      NOT NULL,
  doctor_id                 CHAR(36)      NULL,
  branch_id                 CHAR(36)      NULL,
  budget_date               DATE          NOT NULL,
  valid_until               DATE          NOT NULL,          -- budget_date + tenant.budget_validity_days
  status_id                 CHAR(36)      NOT NULL,          -- catálogo BUDGET_STATUS
  appliance_id              CHAR(36)      NOT NULL,          -- catálogo ORTHO_APPLIANCE
  diagnosis                 TEXT          NULL,
  treatment_plan            TEXT          NULL,
  estimated_months          INT           NOT NULL,
  total_amount              DECIMAL(12,2) NOT NULL DEFAULT 0, -- costo del tratamiento (lista, sin convenio)
  agreement_id              CHAR(36)      NULL,
  agreement_name            VARCHAR(150)  NULL,
  agreement_discount_pct    DECIMAL(5,2)  NOT NULL DEFAULT 0,
  agreement_discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0, -- ROUND(total * pct / 100, 2)
  net_amount                DECIMAL(12,2) NOT NULL DEFAULT 0, -- total - descuento convenio
  initial_payment           DECIMAL(12,2) NOT NULL DEFAULT 0,
  installments              INT           NOT NULL DEFAULT 1, -- N° de cuotas mensuales
  installment_amount        DECIMAL(12,2) NOT NULL DEFAULT 0, -- ROUND((neto - inicial) / N, 2)
  last_installment_amount   DECIMAL(12,2) NOT NULL DEFAULT 0, -- absorbe el redondeo
  includes_retainers        TINYINT(1)    NOT NULL DEFAULT 0,
  retainer_amount           DECIMAL(12,2) NOT NULL DEFAULT 0, -- contención (aparte de las cuotas)
  grand_total               DECIMAL(12,2) NOT NULL DEFAULT 0, -- neto + contención
  currency_id               CHAR(36)      NOT NULL,
  notes                     TEXT          NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ortho_budget_number (tenant_id, budget_number),
  KEY ix_ortho_budget_patient (tenant_id, patient_id),
  KEY ix_ortho_budget_date (tenant_id, budget_date),
  KEY ix_ortho_budget_updated (tenant_id, updated_at),
  CONSTRAINT fk_obudget_tenant    FOREIGN KEY (tenant_id)    REFERENCES tenant(id),
  CONSTRAINT fk_obudget_patient   FOREIGN KEY (patient_id)   REFERENCES patient(id),
  CONSTRAINT fk_obudget_doctor    FOREIGN KEY (doctor_id)    REFERENCES doctor(id),
  CONSTRAINT fk_obudget_branch    FOREIGN KEY (branch_id)    REFERENCES branch(id),
  CONSTRAINT fk_obudget_status    FOREIGN KEY (status_id)    REFERENCES master_item(id),
  CONSTRAINT fk_obudget_appliance FOREIGN KEY (appliance_id) REFERENCES master_item(id),
  CONSTRAINT fk_obudget_currency  FOREIGN KEY (currency_id)  REFERENCES master_item(id),
  CONSTRAINT fk_obudget_agreement FOREIGN KEY (agreement_id) REFERENCES agreement(id),
  CONSTRAINT ck_obudget_installments CHECK (installments >= 1),
  CONSTRAINT ck_obudget_initial CHECK (initial_payment >= 0 AND initial_payment <= net_amount),
  CONSTRAINT ck_obudget_amounts CHECK (total_amount >= 0 AND retainer_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
