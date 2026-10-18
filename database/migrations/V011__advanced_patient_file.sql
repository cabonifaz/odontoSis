-- =====================================================================
-- V011 - Ficha de paciente avanzada, tarifarios, dependientes y datos del personal
--   * Modo de ficha (STANDARD | ADVANCED) por clínica y opcionalmente por sede (NULL = hereda)
--   * Tarifarios (listas de precios) por clínica/sede; el paciente tiene uno asignado
--   * Paciente: apellido materno, celular, mensajería, estado civil, captación, carné,
--     ubigeo (distrito), sede, doctor asignado, tipo de atención, tarifario y titular (dependientes)
--   * Personal: apodo, avatar y fecha de nacimiento (cumpleaños)
-- =====================================================================

-- ---------- Modo de ficha ----------
ALTER TABLE tenant ADD COLUMN patient_form_mode VARCHAR(20) NOT NULL DEFAULT 'STANDARD' AFTER budget_notes;
ALTER TABLE branch ADD COLUMN patient_form_mode VARCHAR(20) NULL AFTER phone;

-- ---------- Catálogos ----------
INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'MARITAL_STATUS',     'Estado civil',          NULL, 0, 1),
 (UUID(), 'ACQUISITION_SOURCE', 'Captación del paciente', '¿Cómo nos conoció?', 1, 1),
 (UUID(), 'ATTENTION_TYPE',     'Tipo de atención',       NULL, 1, 1),
 (UUID(), 'PATIENT_FILE_TYPE',  'Tipo de archivo del paciente', NULL, 1, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, NULL, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'MARITAL_STATUS' t, 'SINGLE' code, 'Soltero(a)' name, 1 ord UNION ALL
    SELECT 'MARITAL_STATUS', 'MARRIED', 'Casado(a)', 2 UNION ALL
    SELECT 'MARITAL_STATUS', 'COHABITING', 'Conviviente', 3 UNION ALL
    SELECT 'MARITAL_STATUS', 'DIVORCED', 'Divorciado(a)', 4 UNION ALL
    SELECT 'MARITAL_STATUS', 'WIDOWED', 'Viudo(a)', 5 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'FACEBOOK', 'Facebook', 1 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'INSTAGRAM', 'Instagram', 2 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'TIKTOK', 'TikTok', 3 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'GOOGLE', 'Google / web', 4 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'REFERRED_PATIENT', 'Recomendado por un paciente', 5 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'REFERRED_DOCTOR', 'Recomendado por un doctor', 6 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'AGREEMENT', 'Convenio', 7 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'WALK_IN', 'Pasaba por la clínica', 8 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'ADVERTISING', 'Publicidad / volante', 9 UNION ALL
    SELECT 'ACQUISITION_SOURCE', 'OTHER', 'Otro', 10 UNION ALL
    SELECT 'ATTENTION_TYPE', 'GENERAL', 'Odontología general', 1 UNION ALL
    SELECT 'ATTENTION_TYPE', 'ORTHODONTICS', 'Ortodoncia', 2 UNION ALL
    SELECT 'ATTENTION_TYPE', 'PEDIATRIC', 'Odontopediatría', 3 UNION ALL
    SELECT 'ATTENTION_TYPE', 'ENDODONTICS', 'Endodoncia', 4 UNION ALL
    SELECT 'ATTENTION_TYPE', 'PERIODONTICS', 'Periodoncia', 5 UNION ALL
    SELECT 'ATTENTION_TYPE', 'IMPLANTS', 'Implantes', 6 UNION ALL
    SELECT 'ATTENTION_TYPE', 'AESTHETIC', 'Estética dental', 7 UNION ALL
    SELECT 'ATTENTION_TYPE', 'SURGERY', 'Cirugía', 8 UNION ALL
    SELECT 'PATIENT_FILE_TYPE', 'XRAY', 'Radiografía', 1 UNION ALL
    SELECT 'PATIENT_FILE_TYPE', 'PHOTO', 'Fotografía clínica', 2 UNION ALL
    SELECT 'PATIENT_FILE_TYPE', 'CONSENT', 'Consentimiento informado', 3 UNION ALL
    SELECT 'PATIENT_FILE_TYPE', 'LAB', 'Resultado de laboratorio', 4 UNION ALL
    SELECT 'PATIENT_FILE_TYPE', 'OTHER', 'Otro documento', 5
  ) v ON v.t = mt.code;

-- ---------- Tarifarios (listas de precios) ----------
CREATE TABLE price_list (
  id         CHAR(36)     NOT NULL,
  tenant_id  CHAR(36)     NOT NULL,
  branch_id  CHAR(36)     NULL,                      -- NULL = toda la clínica
  code       VARCHAR(30)  NOT NULL,
  name       VARCHAR(120) NOT NULL,                  -- p. ej. "PARTICULAR MAYOLO"
  group_name VARCHAR(120) NULL,                      -- "Tipo de plan", p. ej. "PLANES MULTIDENT"
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_price_list_tenant (tenant_id, is_active),
  KEY ix_price_list_updated (tenant_id, updated_at),
  CONSTRAINT fk_price_list_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT fk_price_list_branch FOREIGN KEY (branch_id) REFERENCES branch(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Precio de un servicio en un tarifario (si no existe, se usa el precio base del servicio)
CREATE TABLE price_list_item (
  id            CHAR(36)      NOT NULL,
  tenant_id     CHAR(36)      NOT NULL,
  price_list_id CHAR(36)      NOT NULL,
  service_id    CHAR(36)      NOT NULL,
  price         DECIMAL(12,2) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_price_list_item (price_list_id, service_id),
  KEY ix_pli_updated (tenant_id, updated_at),
  CONSTRAINT fk_pli_tenant  FOREIGN KEY (tenant_id)     REFERENCES tenant(id),
  CONSTRAINT fk_pli_list    FOREIGN KEY (price_list_id) REFERENCES price_list(id),
  CONSTRAINT fk_pli_service FOREIGN KEY (service_id)    REFERENCES service(id),
  CONSTRAINT ck_pli_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tarifario "Particular" por defecto para cada clínica existente
INSERT INTO price_list (id, tenant_id, code, name, group_name, is_default, is_active)
SELECT UUID(), t.id, 'PARTICULAR', 'Particular', 'Tarifario general', 1, 1 FROM tenant t WHERE t.deleted_at IS NULL;

-- ---------- Paciente: ficha avanzada ----------
ALTER TABLE patient
  ADD COLUMN mother_last_name      VARCHAR(100) NULL AFTER last_name,
  ADD COLUMN mobile_enc            VARCHAR(255) NULL AFTER phone_enc,
  ADD COLUMN messaging_enc         VARCHAR(255) NULL AFTER mobile_enc,
  ADD COLUMN marital_status_id     CHAR(36)     NULL AFTER sex_id,
  ADD COLUMN acquisition_source_id CHAR(36)     NULL AFTER marital_status_id,
  ADD COLUMN card_number           VARCHAR(40)  NULL AFTER acquisition_source_id,
  ADD COLUMN district_id           CHAR(36)     NULL AFTER address_enc,
  ADD COLUMN home_branch_id        CHAR(36)     NULL AFTER district_id,
  ADD COLUMN assigned_doctor_id    CHAR(36)     NULL AFTER home_branch_id,
  ADD COLUMN attention_type_id     CHAR(36)     NULL AFTER assigned_doctor_id,
  ADD COLUMN price_list_id         CHAR(36)     NULL AFTER attention_type_id,
  ADD COLUMN titular_patient_id    CHAR(36)     NULL AFTER price_list_id,
  ADD COLUMN titular_relationship_id CHAR(36)   NULL AFTER titular_patient_id,
  ADD KEY ix_patient_titular (tenant_id, titular_patient_id),
  ADD KEY ix_patient_birthday (tenant_id, birth_date),
  ADD CONSTRAINT fk_patient_marital    FOREIGN KEY (marital_status_id)     REFERENCES master_item(id),
  ADD CONSTRAINT fk_patient_acq        FOREIGN KEY (acquisition_source_id) REFERENCES master_item(id),
  ADD CONSTRAINT fk_patient_district   FOREIGN KEY (district_id)           REFERENCES master_item(id),
  ADD CONSTRAINT fk_patient_branch     FOREIGN KEY (home_branch_id)        REFERENCES branch(id),
  ADD CONSTRAINT fk_patient_doctor     FOREIGN KEY (assigned_doctor_id)    REFERENCES doctor(id),
  ADD CONSTRAINT fk_patient_attention  FOREIGN KEY (attention_type_id)     REFERENCES master_item(id),
  ADD CONSTRAINT fk_patient_price_list FOREIGN KEY (price_list_id)         REFERENCES price_list(id),
  ADD CONSTRAINT fk_patient_titular    FOREIGN KEY (titular_patient_id)    REFERENCES patient(id),
  ADD CONSTRAINT fk_patient_titular_rel FOREIGN KEY (titular_relationship_id) REFERENCES master_item(id);

-- ---------- Presupuesto: tarifario aplicado (copia) ----------
ALTER TABLE budget
  ADD COLUMN price_list_id   CHAR(36)     NULL AFTER branch_id,
  ADD COLUMN price_list_name VARCHAR(120) NULL AFTER price_list_id,
  ADD CONSTRAINT fk_budget_price_list FOREIGN KEY (price_list_id) REFERENCES price_list(id);

-- ---------- Personal: apodo, avatar y cumpleaños ----------
ALTER TABLE app_user
  ADD COLUMN nickname   VARCHAR(40) NULL AFTER full_name,
  ADD COLUMN avatar     VARCHAR(40) NULL AFTER nickname,
  ADD COLUMN birth_date DATE        NULL AFTER avatar;

ALTER TABLE doctor
  ADD COLUMN birth_date DATE NULL AFTER email;
