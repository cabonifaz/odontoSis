-- =====================================================================
-- V021 - Consentimientos del paciente (Perú)
--   * DATA_PROTECTION        Tratamiento de datos personales y datos sensibles de salud (Ley N° 29733 y su Reglamento)
--   * MEDICAL_CONFIDENTIALITY Reserva / secreto de la información clínica (Ley N° 26842, Ley N° 29414)
--   Cada registro guarda quién firmó (paciente o apoderado), cuándo, la versión del formato y el
--   documento firmado escaneado (file_asset kind CONSENT). Se conservan el historial y las revocaciones.
-- =====================================================================

INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'CONSENT_TYPE', 'Tipos de consentimiento del paciente', 'Consentimientos exigidos por la normativa peruana', 0, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, v.value, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'DATA_PROTECTION' code, 'Tratamiento de datos personales' name, 'Ley N° 29733' value, 1 ord UNION ALL
    SELECT 'MEDICAL_CONFIDENTIALITY', 'Confidencialidad de la información clínica', 'Ley N° 26842', 2
  ) v ON mt.code = 'CONSENT_TYPE';

CREATE TABLE patient_consent (
  id                  CHAR(36)     NOT NULL,
  tenant_id           CHAR(36)     NOT NULL,
  patient_id          CHAR(36)     NOT NULL,
  type_id             CHAR(36)     NOT NULL,          -- master CONSENT_TYPE
  form_version        VARCHAR(20)  NOT NULL,          -- versión del texto del formato firmado
  signer_type         VARCHAR(10)  NOT NULL,          -- PATIENT | GUARDIAN
  signer_name         VARCHAR(200) NOT NULL,
  signer_doc_type_id  CHAR(36)     NULL,
  signer_doc_number_enc VARCHAR(255) NULL,            -- cifrado en la app
  signer_relationship_id CHAR(36)  NULL,              -- parentesco del apoderado
  signed_on           DATE         NOT NULL,
  marketing_opt_in    TINYINT(1)   NULL,              -- sólo DATA_PROTECTION: acepta comunicaciones comerciales
  file_id             CHAR(36)     NULL,              -- formato firmado escaneado
  status              VARCHAR(12)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | REPLACED | REVOKED
  revoked_on          DATE         NULL,
  revoke_reason       VARCHAR(500) NULL,
  notes               VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_consent_patient (tenant_id, patient_id, status),
  CONSTRAINT fk_consent_tenant   FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_consent_patient  FOREIGN KEY (patient_id) REFERENCES patient(id),
  CONSTRAINT fk_consent_type     FOREIGN KEY (type_id)    REFERENCES master_item(id),
  CONSTRAINT fk_consent_doc_type FOREIGN KEY (signer_doc_type_id) REFERENCES master_item(id),
  CONSTRAINT fk_consent_relation FOREIGN KEY (signer_relationship_id) REFERENCES master_item(id),
  CONSTRAINT fk_consent_file     FOREIGN KEY (file_id)    REFERENCES file_asset(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
