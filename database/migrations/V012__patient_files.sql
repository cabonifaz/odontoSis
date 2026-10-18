-- =====================================================================
-- V012 - Imágenes y archivos del paciente (radiografías, fotos, consentimientos, laboratorio...)
--   El binario vive en el volumen persistente (file_asset, kind = 'PATIENT_FILE');
--   aquí se guarda la metadata clínica: tipo (catálogo PATIENT_FILE_TYPE), título, fecha y pieza FDI.
-- =====================================================================
CREATE TABLE patient_file (
  id          CHAR(36)     NOT NULL,
  tenant_id   CHAR(36)     NOT NULL,
  patient_id  CHAR(36)     NOT NULL,
  file_id     CHAR(36)     NOT NULL,
  type_id     CHAR(36)     NOT NULL,              -- master_item de PATIENT_FILE_TYPE
  title       VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  taken_at    DATE         NULL,                  -- fecha de la toma / del documento
  tooth_code  VARCHAR(4)   NULL,                  -- pieza FDI opcional, p. ej. '4.5'
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_patient_file_file (file_id),
  KEY ix_patient_file_patient (tenant_id, patient_id, deleted_at),
  KEY ix_patient_file_updated (tenant_id, updated_at),
  CONSTRAINT fk_patient_file_tenant  FOREIGN KEY (tenant_id)  REFERENCES tenant(id),
  CONSTRAINT fk_patient_file_patient FOREIGN KEY (patient_id) REFERENCES patient(id),
  CONSTRAINT fk_patient_file_file    FOREIGN KEY (file_id)    REFERENCES file_asset(id),
  CONSTRAINT fk_patient_file_type    FOREIGN KEY (type_id)    REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
