-- =====================================================================
-- V001 - Esquema base OdontoSis (multi-tenant)
-- Convenciones:
--   * PK CHAR(36) UUID (generables offline en el cliente)
--   * Fechas/hora en UTC, DATETIME(3)
--   * Auditoría en TODAS las tablas (created/updated/deleted at + by)
--   * Borrado lógico (deleted_at) — nunca DELETE físico desde la app
--   * Catálogos vía tabla maestro de maestros (master_table / master_item)
--   * Datos sensibles cifrados en la app (AES-256-GCM) -> columnas *_enc
--   * Búsqueda sobre datos cifrados por blind index HMAC -> columnas *_bidx
-- =====================================================================

-- ---------- Maestro de maestros ----------
CREATE TABLE master_table (
  id              CHAR(36)     NOT NULL,
  code            VARCHAR(60)  NOT NULL,
  name            VARCHAR(120) NOT NULL,
  description     VARCHAR(255) NULL,
  tenant_editable TINYINT(1)   NOT NULL DEFAULT 0,
  is_system       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_master_table_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE master_item (
  id              CHAR(36)     NOT NULL,
  master_table_id CHAR(36)     NOT NULL,
  tenant_id       CHAR(36)     NULL,            -- NULL = global del sistema
  parent_id       CHAR(36)     NULL,
  code            VARCHAR(60)  NOT NULL,
  name            VARCHAR(150) NOT NULL,
  value           VARCHAR(255) NULL,            -- dato extra (color, símbolo, abreviatura)
  sort_order      INT          NOT NULL DEFAULT 0,
  is_system       TINYINT(1)   NOT NULL DEFAULT 0,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_master_item_table (master_table_id, tenant_id, is_active),
  KEY ix_master_item_code (master_table_id, code),
  KEY ix_master_item_updated (tenant_id, updated_at),
  CONSTRAINT fk_master_item_table  FOREIGN KEY (master_table_id) REFERENCES master_table(id),
  CONSTRAINT fk_master_item_parent FOREIGN KEY (parent_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Planes y tenants ----------
CREATE TABLE plan (
  id                CHAR(36)      NOT NULL,
  code              VARCHAR(40)   NOT NULL,
  name              VARCHAR(120)  NOT NULL,
  description       VARCHAR(500)  NULL,
  max_users         INT           NOT NULL,
  max_patients      INT           NULL,
  max_storage_mb    INT           NOT NULL DEFAULT 500,
  price             DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency_id       CHAR(36)      NOT NULL,
  billing_period_id CHAR(36)      NOT NULL,
  is_active         TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_code (code),
  CONSTRAINT fk_plan_currency FOREIGN KEY (currency_id) REFERENCES master_item(id),
  CONSTRAINT fk_plan_period   FOREIGN KEY (billing_period_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE file_asset (
  id            CHAR(36)     NOT NULL,
  tenant_id     CHAR(36)     NULL,
  kind          VARCHAR(30)  NOT NULL,           -- LOGO | ATTACHMENT
  storage_key   VARCHAR(255) NOT NULL,           -- ruta relativa dentro de UPLOAD_DIR
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    INT          NOT NULL,
  sha256        CHAR(64)     NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_file_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tenant (
  id                   CHAR(36)     NOT NULL,
  code                 VARCHAR(40)  NOT NULL,     -- slug
  legal_name           VARCHAR(200) NOT NULL,
  trade_name           VARCHAR(200) NOT NULL,
  tax_id               VARCHAR(20)  NULL,         -- RUC
  email                VARCHAR(200) NULL,
  phone                VARCHAR(40)  NULL,
  address              VARCHAR(300) NULL,
  plan_id              CHAR(36)     NOT NULL,
  status_id            CHAR(36)     NOT NULL,
  max_users_override   INT          NULL,
  primary_color        VARCHAR(7)   NOT NULL DEFAULT '#0E7490',
  secondary_color      VARCHAR(7)   NOT NULL DEFAULT '#F59E0B',
  logo_file_id         CHAR(36)     NULL,
  currency_id          CHAR(36)     NOT NULL,
  timezone             VARCHAR(64)  NOT NULL DEFAULT 'America/Lima',
  budget_validity_days INT          NOT NULL DEFAULT 15,
  budget_notes         TEXT         NULL,
  subscription_start   DATE         NULL,
  subscription_end     DATE         NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_code (code),
  CONSTRAINT fk_tenant_plan     FOREIGN KEY (plan_id) REFERENCES plan(id),
  CONSTRAINT fk_tenant_status   FOREIGN KEY (status_id) REFERENCES master_item(id),
  CONSTRAINT fk_tenant_currency FOREIGN KEY (currency_id) REFERENCES master_item(id),
  CONSTRAINT fk_tenant_logo     FOREIGN KEY (logo_file_id) REFERENCES file_asset(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE master_item ADD CONSTRAINT fk_master_item_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id);
ALTER TABLE file_asset  ADD CONSTRAINT fk_file_tenant        FOREIGN KEY (tenant_id) REFERENCES tenant(id);

CREATE TABLE tenant_payment (
  id           CHAR(36)      NOT NULL,
  tenant_id    CHAR(36)      NOT NULL,
  plan_id      CHAR(36)      NOT NULL,
  amount       DECIMAL(12,2) NOT NULL,
  currency_id  CHAR(36)      NOT NULL,
  period_start DATE          NOT NULL,
  period_end   DATE          NOT NULL,
  paid_at      DATETIME(3)   NULL,
  method_id    CHAR(36)      NULL,
  status_id    CHAR(36)      NOT NULL,
  reference    VARCHAR(120)  NULL,
  notes        VARCHAR(500)  NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_tenant_payment_tenant (tenant_id, period_start),
  CONSTRAINT fk_tpay_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenant(id),
  CONSTRAINT fk_tpay_plan     FOREIGN KEY (plan_id)     REFERENCES plan(id),
  CONSTRAINT fk_tpay_currency FOREIGN KEY (currency_id) REFERENCES master_item(id),
  CONSTRAINT fk_tpay_method   FOREIGN KEY (method_id)   REFERENCES master_item(id),
  CONSTRAINT fk_tpay_status   FOREIGN KEY (status_id)   REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tenant_sequence (
  tenant_id  CHAR(36)    NOT NULL,
  seq_code   VARCHAR(40) NOT NULL,              -- PATIENT_RECORD | BUDGET
  current_value INT      NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (tenant_id, seq_code),
  CONSTRAINT fk_tseq_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Seguridad: roles, usuarios, sesiones ----------
CREATE TABLE role (
  id          CHAR(36)     NOT NULL,
  tenant_id   CHAR(36)     NULL,                -- NULL = rol del sistema
  code        VARCHAR(40)  NOT NULL,
  name        VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  permissions JSON         NOT NULL,
  is_system   TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_role_tenant (tenant_id, code),
  CONSTRAINT fk_role_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE app_user (
  id                   CHAR(36)     NOT NULL,
  tenant_id            CHAR(36)     NULL,       -- NULL = super admin de plataforma
  role_id              CHAR(36)     NOT NULL,
  email                VARCHAR(200) NOT NULL,   -- normalizado (lower/trim)
  password_hash        VARCHAR(255) NOT NULL,   -- argon2id
  full_name            VARCHAR(200) NOT NULL,
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  must_change_password TINYINT(1)   NOT NULL DEFAULT 1,
  failed_login_count   INT          NOT NULL DEFAULT 0,
  locked_until         DATETIME(3)  NULL,
  last_login_at        DATETIME(3)  NULL,
  last_login_ip        VARCHAR(64)  NULL,
  password_changed_at  DATETIME(3)  NULL,
  totp_secret_enc      VARCHAR(255) NULL,
  totp_enabled         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_user_email (email),
  KEY ix_app_user_tenant (tenant_id, is_active),
  CONSTRAINT fk_user_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT fk_user_role   FOREIGN KEY (role_id)   REFERENCES role(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE user_session (
  id           CHAR(36)     NOT NULL,
  user_id      CHAR(36)     NOT NULL,
  token_hash   CHAR(64)     NOT NULL,           -- SHA-256 del token (el token nunca se guarda)
  ip           VARCHAR(64)  NULL,
  user_agent   VARCHAR(300) NULL,
  mfa_verified TINYINT(1)   NOT NULL DEFAULT 0,
  expires_at   DATETIME(3)  NOT NULL,
  last_seen_at DATETIME(3)  NULL,
  revoked_at   DATETIME(3)  NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_token (token_hash),
  KEY ix_session_user (user_id),
  CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Clínica ----------
CREATE TABLE doctor (
  id             CHAR(36)     NOT NULL,
  tenant_id      CHAR(36)     NOT NULL,
  user_id        CHAR(36)     NULL,
  first_name     VARCHAR(100) NOT NULL,
  last_name      VARCHAR(100) NOT NULL,
  license_number VARCHAR(30)  NULL,            -- COP
  specialty_id   CHAR(36)     NULL,
  email          VARCHAR(200) NULL,
  phone_enc      VARCHAR(255) NULL,
  agenda_color   VARCHAR(7)   NOT NULL DEFAULT '#0E7490',
  is_active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_doctor_tenant (tenant_id, is_active),
  KEY ix_doctor_updated (tenant_id, updated_at),
  CONSTRAINT fk_doctor_tenant    FOREIGN KEY (tenant_id)    REFERENCES tenant(id),
  CONSTRAINT fk_doctor_user      FOREIGN KEY (user_id)      REFERENCES app_user(id),
  CONSTRAINT fk_doctor_specialty FOREIGN KEY (specialty_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE patient (
  id                  CHAR(36)     NOT NULL,
  tenant_id           CHAR(36)     NOT NULL,
  record_number       VARCHAR(20)  NOT NULL,   -- H.C. N°
  doc_type_id         CHAR(36)     NULL,
  doc_number_enc      VARCHAR(255) NULL,
  doc_number_bidx     CHAR(64)     NULL,
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  birth_date          DATE         NULL,
  sex_id              CHAR(36)     NULL,
  phone_enc           VARCHAR(255) NULL,
  email_enc           VARCHAR(400) NULL,
  address_enc         VARCHAR(800) NULL,
  insurance_company   VARCHAR(150) NULL,
  deductible          DECIMAL(12,2) NULL,
  coinsurance_pct     DECIMAL(5,2)  NULL,
  allergies_enc       TEXT         NULL,
  medical_history_enc TEXT         NULL,
  notes_enc           TEXT         NULL,
  is_active           TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_record (tenant_id, record_number),
  KEY ix_patient_doc (tenant_id, doc_number_bidx),
  KEY ix_patient_name (tenant_id, last_name, first_name),
  KEY ix_patient_updated (tenant_id, updated_at),
  CONSTRAINT fk_patient_tenant  FOREIGN KEY (tenant_id)   REFERENCES tenant(id),
  CONSTRAINT fk_patient_doctype FOREIGN KEY (doc_type_id) REFERENCES master_item(id),
  CONSTRAINT fk_patient_sex     FOREIGN KEY (sex_id)      REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Lista de precios / servicios
CREATE TABLE service (
  id           CHAR(36)      NOT NULL,
  tenant_id    CHAR(36)      NOT NULL,
  code         VARCHAR(20)   NOT NULL,
  name         VARCHAR(200)  NOT NULL,
  category_id  CHAR(36)      NULL,
  currency_id  CHAR(36)      NOT NULL,
  price        DECIMAL(12,2) NOT NULL,
  requires_lab TINYINT(1)    NOT NULL DEFAULT 0,
  per_piece    TINYINT(1)    NOT NULL DEFAULT 1,
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_service_tenant (tenant_id, is_active, name),
  KEY ix_service_code (tenant_id, code),
  KEY ix_service_updated (tenant_id, updated_at),
  CONSTRAINT fk_service_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenant(id),
  CONSTRAINT fk_service_category FOREIGN KEY (category_id) REFERENCES master_item(id),
  CONSTRAINT fk_service_currency FOREIGN KEY (currency_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Presupuestos
CREATE TABLE budget (
  id                CHAR(36)      NOT NULL,
  tenant_id         CHAR(36)      NOT NULL,
  budget_number     VARCHAR(20)   NOT NULL,
  patient_id        CHAR(36)      NOT NULL,
  doctor_id         CHAR(36)      NULL,
  budget_date       DATE          NOT NULL,
  valid_until       DATE          NOT NULL,
  status_id         CHAR(36)      NOT NULL,
  currency_id       CHAR(36)      NOT NULL,
  insurance_company VARCHAR(150)  NULL,
  deductible        DECIMAL(12,2) NOT NULL DEFAULT 0,  -- deducible por pieza
  coinsurance_pct   DECIMAL(5,2)  NOT NULL DEFAULT 0,
  subtotal          DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount          DECIMAL(12,2) NOT NULL DEFAULT 0,
  total             DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes             TEXT          NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_budget_number (tenant_id, budget_number),
  KEY ix_budget_patient (tenant_id, patient_id),
  KEY ix_budget_date (tenant_id, budget_date),
  KEY ix_budget_updated (tenant_id, updated_at),
  CONSTRAINT fk_budget_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenant(id),
  CONSTRAINT fk_budget_patient  FOREIGN KEY (patient_id)  REFERENCES patient(id),
  CONSTRAINT fk_budget_doctor   FOREIGN KEY (doctor_id)   REFERENCES doctor(id),
  CONSTRAINT fk_budget_status   FOREIGN KEY (status_id)   REFERENCES master_item(id),
  CONSTRAINT fk_budget_currency FOREIGN KEY (currency_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE budget_item (
  id          CHAR(36)      NOT NULL,
  tenant_id   CHAR(36)      NOT NULL,
  budget_id   CHAR(36)      NOT NULL,
  tooth_code  VARCHAR(4)    NULL,              -- FDI, ej. '4.5' (NULL = general)
  surfaces    VARCHAR(10)   NULL,              -- ej. 'OVLMD'
  service_id  CHAR(36)      NULL,
  description VARCHAR(250)  NOT NULL,
  quantity    DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price  DECIMAL(12,2) NOT NULL,
  deductible  DECIMAL(12,2) NOT NULL DEFAULT 0,
  coinsurance DECIMAL(12,2) NOT NULL DEFAULT 0,
  total       DECIMAL(12,2) NOT NULL,
  sort_order  INT           NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_budget_item_budget (budget_id, sort_order),
  CONSTRAINT fk_bitem_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_bitem_budget  FOREIGN KEY (budget_id)  REFERENCES budget(id),
  CONSTRAINT fk_bitem_service FOREIGN KEY (service_id) REFERENCES service(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Odontograma (por paciente; opcionalmente asociado a un presupuesto)
CREATE TABLE odontogram (
  id              CHAR(36)    NOT NULL,
  tenant_id       CHAR(36)    NOT NULL,
  patient_id      CHAR(36)    NOT NULL,
  budget_id       CHAR(36)    NULL,
  odontogram_date DATE        NOT NULL,
  notes           TEXT        NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_odontogram_patient (tenant_id, patient_id),
  KEY ix_odontogram_budget (budget_id),
  CONSTRAINT fk_odg_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_odg_patient FOREIGN KEY (patient_id) REFERENCES patient(id),
  CONSTRAINT fk_odg_budget  FOREIGN KEY (budget_id)  REFERENCES budget(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE odontogram_mark (
  id            CHAR(36)     NOT NULL,
  tenant_id     CHAR(36)     NOT NULL,
  odontogram_id CHAR(36)     NOT NULL,
  tooth_code    VARCHAR(4)   NOT NULL,
  surface       VARCHAR(2)   NULL,             -- O,V,L,M,D (NULL = pieza completa)
  condition_id  CHAR(36)     NOT NULL,
  notes         VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_odg_mark (odontogram_id, tooth_code),
  CONSTRAINT fk_odgm_tenant     FOREIGN KEY (tenant_id)     REFERENCES tenant(id),
  CONSTRAINT fk_odgm_odontogram FOREIGN KEY (odontogram_id) REFERENCES odontogram(id),
  CONSTRAINT fk_odgm_condition  FOREIGN KEY (condition_id)  REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Citas / agenda
CREATE TABLE appointment (
  id         CHAR(36)     NOT NULL,
  tenant_id  CHAR(36)     NOT NULL,
  patient_id CHAR(36)     NOT NULL,
  doctor_id  CHAR(36)     NOT NULL,
  start_at   DATETIME(3)  NOT NULL,
  end_at     DATETIME(3)  NOT NULL,
  status_id  CHAR(36)     NOT NULL,
  reason     VARCHAR(250) NULL,
  notes      TEXT         NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_appt_range (tenant_id, start_at),
  KEY ix_appt_doctor (tenant_id, doctor_id, start_at),
  KEY ix_appt_patient (tenant_id, patient_id),
  KEY ix_appt_updated (tenant_id, updated_at),
  CONSTRAINT fk_appt_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patient(id),
  CONSTRAINT fk_appt_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctor(id),
  CONSTRAINT fk_appt_status  FOREIGN KEY (status_id)  REFERENCES master_item(id),
  CONSTRAINT ck_appt_range CHECK (end_at > start_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Bitácora de auditoría (detalle de cambios)
CREATE TABLE audit_log (
  id         BIGINT       NOT NULL AUTO_INCREMENT,
  tenant_id  CHAR(36)     NULL,
  user_id    CHAR(36)     NULL,
  entity     VARCHAR(60)  NOT NULL,
  entity_id  VARCHAR(64)  NULL,
  action     VARCHAR(40)  NOT NULL,
  detail     JSON         NULL,
  ip         VARCHAR(64)  NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_audit_tenant (tenant_id, created_at),
  KEY ix_audit_entity (entity, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
