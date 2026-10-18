-- =====================================================================
-- V013 - Derivaciones (referral) y cartas de garantía para seguros (guarantee_letter)
--   * Catálogos REFERRAL_STATUS y GUARANTEE_LETTER_STATUS (value = color hex)
--   * Derivación: a un especialista/clínica externa o a un doctor de la misma clínica
--   * Carta de garantía: solicitud de cobertura a la aseguradora, opcionalmente ligada a un presupuesto
-- =====================================================================

-- ---------- Catálogos ----------
INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'REFERRAL_STATUS',         'Estados de derivación',          NULL, 0, 1),
 (UUID(), 'GUARANTEE_LETTER_STATUS', 'Estados de carta de garantía',   NULL, 0, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, v.value, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'REFERRAL_STATUS' t, 'PENDING' code, 'Pendiente' name, '#F59E0B' value, 1 ord UNION ALL
    SELECT 'REFERRAL_STATUS', 'SCHEDULED', 'Agendada', '#0EA5E9', 2 UNION ALL
    SELECT 'REFERRAL_STATUS', 'ATTENDED', 'Atendida', '#16A34A', 3 UNION ALL
    SELECT 'REFERRAL_STATUS', 'CANCELLED', 'Cancelada', '#6B7280', 4 UNION ALL
    SELECT 'GUARANTEE_LETTER_STATUS', 'DRAFT', 'Borrador', '#6B7280', 1 UNION ALL
    SELECT 'GUARANTEE_LETTER_STATUS', 'SENT', 'Enviada', '#0EA5E9', 2 UNION ALL
    SELECT 'GUARANTEE_LETTER_STATUS', 'APPROVED', 'Aprobada', '#16A34A', 3 UNION ALL
    SELECT 'GUARANTEE_LETTER_STATUS', 'PARTIAL', 'Aprobada parcial', '#F59E0B', 4 UNION ALL
    SELECT 'GUARANTEE_LETTER_STATUS', 'REJECTED', 'Rechazada', '#DC2626', 5
  ) v ON v.t = mt.code;

-- ---------- Derivaciones ----------
CREATE TABLE referral (
  id                  CHAR(36)     NOT NULL,
  tenant_id           CHAR(36)     NOT NULL,
  patient_id          CHAR(36)     NOT NULL,
  from_doctor_id      CHAR(36)     NULL,             -- doctor que deriva
  referral_date       DATE         NOT NULL,
  specialty_id        CHAR(36)     NULL,             -- master SPECIALTY
  referred_to_name    VARCHAR(200) NULL,             -- especialista o clínica externa (o nombre del doctor interno)
  referred_to_contact VARCHAR(200) NULL,
  is_internal         TINYINT(1)   NOT NULL DEFAULT 0,  -- 1 = a un doctor de la misma clínica
  to_doctor_id        CHAR(36)     NULL,
  reason              TEXT         NOT NULL,
  clinical_notes      TEXT         NULL,
  status_id           CHAR(36)     NOT NULL,         -- master REFERRAL_STATUS
  response_notes      TEXT         NULL,             -- contrarreferencia / respuesta del especialista
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_referral_patient (tenant_id, patient_id, referral_date),
  KEY ix_referral_updated (tenant_id, updated_at),
  CONSTRAINT fk_referral_tenant      FOREIGN KEY (tenant_id)      REFERENCES tenant(id),
  CONSTRAINT fk_referral_patient     FOREIGN KEY (patient_id)     REFERENCES patient(id),
  CONSTRAINT fk_referral_from_doctor FOREIGN KEY (from_doctor_id) REFERENCES doctor(id),
  CONSTRAINT fk_referral_to_doctor   FOREIGN KEY (to_doctor_id)   REFERENCES doctor(id),
  CONSTRAINT fk_referral_specialty   FOREIGN KEY (specialty_id)   REFERENCES master_item(id),
  CONSTRAINT fk_referral_status      FOREIGN KEY (status_id)      REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Cartas de garantía ----------
CREATE TABLE guarantee_letter (
  id                CHAR(36)      NOT NULL,
  tenant_id         CHAR(36)      NOT NULL,
  patient_id        CHAR(36)      NOT NULL,
  budget_id         CHAR(36)      NULL,
  insurance_company VARCHAR(150)  NOT NULL,
  letter_number     VARCHAR(40)   NULL,            -- N° asignado por la aseguradora
  request_date      DATE          NOT NULL,
  response_date     DATE          NULL,
  amount_requested  DECIMAL(12,2) NOT NULL DEFAULT 0,
  amount_approved   DECIMAL(12,2) NULL,
  coverage_pct      DECIMAL(5,2)  NULL,
  status_id         CHAR(36)      NOT NULL,        -- master GUARANTEE_LETTER_STATUS
  valid_until       DATE          NULL,
  notes             TEXT          NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_gl_patient (tenant_id, patient_id, request_date),
  KEY ix_gl_budget (tenant_id, budget_id),
  KEY ix_gl_updated (tenant_id, updated_at),
  CONSTRAINT fk_gl_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_gl_patient FOREIGN KEY (patient_id) REFERENCES patient(id),
  CONSTRAINT fk_gl_budget  FOREIGN KEY (budget_id)  REFERENCES budget(id),
  CONSTRAINT fk_gl_status  FOREIGN KEY (status_id)  REFERENCES master_item(id),
  CONSTRAINT ck_gl_amounts CHECK (amount_requested >= 0 AND (amount_approved IS NULL OR amount_approved >= 0)),
  CONSTRAINT ck_gl_coverage CHECK (coverage_pct IS NULL OR (coverage_pct >= 0 AND coverage_pct <= 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
