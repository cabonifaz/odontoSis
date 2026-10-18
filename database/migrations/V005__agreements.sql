-- =====================================================================
-- V005 - Convenios: acuerdos de promoción de la clínica con empresas o clubes.
-- El paciente puede pertenecer a un convenio; el presupuesto aplica su % de descuento
-- y guarda una copia (nombre y %) vigente al momento de emitirse.
-- =====================================================================
CREATE TABLE agreement (
  id                   CHAR(36)     NOT NULL,
  tenant_id            CHAR(36)     NOT NULL,
  code                 VARCHAR(30)  NOT NULL,
  name                 VARCHAR(150) NOT NULL,           -- nombre del convenio
  company_name         VARCHAR(200) NULL,               -- empresa o club
  discount_pct         DECIMAL(5,2) NOT NULL DEFAULT 0,
  valid_from           DATE         NULL,
  valid_to             DATE         NULL,
  requires_member_code TINYINT(1)   NOT NULL DEFAULT 0, -- exige N° de socio / carnet
  notes                VARCHAR(500) NULL,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_agreement_tenant (tenant_id, is_active),
  KEY ix_agreement_code (tenant_id, code),
  KEY ix_agreement_updated (tenant_id, updated_at),
  CONSTRAINT fk_agreement_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT ck_agreement_pct CHECK (discount_pct >= 0 AND discount_pct <= 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE patient
  ADD COLUMN agreement_id          CHAR(36)    NULL AFTER coinsurance_pct,
  ADD COLUMN agreement_member_code VARCHAR(40) NULL AFTER agreement_id,
  ADD CONSTRAINT fk_patient_agreement FOREIGN KEY (agreement_id) REFERENCES agreement(id);

ALTER TABLE budget
  ADD COLUMN agreement_id           CHAR(36)     NULL AFTER coinsurance_pct,
  ADD COLUMN agreement_name         VARCHAR(150) NULL AFTER agreement_id,
  ADD COLUMN agreement_discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER agreement_name,
  ADD CONSTRAINT fk_budget_agreement FOREIGN KEY (agreement_id) REFERENCES agreement(id);
