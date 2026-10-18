-- =====================================================================
-- V017 - Carga masiva (importación) durante el periodo de implementación
--   * Catálogos IMPORT_ENTITY (qué se importa, en orden de dependencias) e IMPORT_STATUS
--   * import_batch: historial de cargas (archivo, filas OK / con error, quién y cuándo)
--   * patient_clinical_note: historia clínica (evoluciones / notas por fecha), texto cifrado en la app
--   * Claves naturales para re-importar sin duplicar:
--       doctor.code            código del doctor en el sistema anterior
--       appointment.external_code / budget.external_code   "codigo_externo" de la planilla
-- =====================================================================

INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'IMPORT_ENTITY', 'Entidades de carga masiva', 'Orden de carga durante la implementación', 0, 1),
 (UUID(), 'IMPORT_STATUS', 'Estados de carga masiva',   NULL, 0, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, v.value, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'IMPORT_ENTITY' t, 'DOCTORS' code, 'Doctores' name, NULL value, 1 ord UNION ALL
    SELECT 'IMPORT_ENTITY', 'AGREEMENTS', 'Convenios', NULL, 2 UNION ALL
    SELECT 'IMPORT_ENTITY', 'SERVICES', 'Lista de precios (servicios)', NULL, 3 UNION ALL
    SELECT 'IMPORT_ENTITY', 'PRICE_LIST_ITEMS', 'Precios por tarifario', NULL, 4 UNION ALL
    SELECT 'IMPORT_ENTITY', 'PATIENTS', 'Pacientes', NULL, 5 UNION ALL
    SELECT 'IMPORT_ENTITY', 'CLINICAL_NOTES', 'Historias clínicas', NULL, 6 UNION ALL
    SELECT 'IMPORT_ENTITY', 'APPOINTMENTS', 'Citas', NULL, 7 UNION ALL
    SELECT 'IMPORT_ENTITY', 'BUDGETS', 'Presupuestos', NULL, 8 UNION ALL
    SELECT 'IMPORT_STATUS', 'PROCESSING', 'En proceso', '#0EA5E9', 1 UNION ALL
    SELECT 'IMPORT_STATUS', 'COMPLETED', 'Completada', '#16A34A', 2 UNION ALL
    SELECT 'IMPORT_STATUS', 'PARTIAL', 'Parcial (filas con error omitidas)', '#F59E0B', 3 UNION ALL
    SELECT 'IMPORT_STATUS', 'FAILED', 'Fallida', '#DC2626', 4
  ) v ON v.t = mt.code;

-- ---------- Historial de cargas ----------
CREATE TABLE import_batch (
  id            CHAR(36)     NOT NULL,
  tenant_id     CHAR(36)     NOT NULL,
  entity_id     CHAR(36)     NOT NULL,              -- master IMPORT_ENTITY
  status_id     CHAR(36)     NOT NULL,              -- master IMPORT_STATUS
  file_name     VARCHAR(255) NOT NULL,
  file_sha256   CHAR(64)     NOT NULL,
  total_rows    INT          NOT NULL DEFAULT 0,
  ok_rows       INT          NOT NULL DEFAULT 0,
  error_rows    INT          NOT NULL DEFAULT 0,
  created_rows  INT          NOT NULL DEFAULT 0,
  updated_rows  INT          NOT NULL DEFAULT 0,
  duration_ms   INT          NULL,
  errors        JSON         NULL,                  -- primeras filas con error (fila, columna, mensaje); sin datos sensibles
  finished_at   DATETIME(3)  NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_import_batch_tenant (tenant_id, created_at),
  CONSTRAINT fk_import_batch_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT fk_import_batch_entity FOREIGN KEY (entity_id) REFERENCES master_item(id),
  CONSTRAINT fk_import_batch_status FOREIGN KEY (status_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Historia clínica (notas de evolución) ----------
CREATE TABLE patient_clinical_note (
  id              CHAR(36)     NOT NULL,
  tenant_id       CHAR(36)     NOT NULL,
  patient_id      CHAR(36)     NOT NULL,
  note_date       DATE         NOT NULL,
  doctor_id       CHAR(36)     NULL,
  note_enc        MEDIUMTEXT   NOT NULL,             -- texto cifrado en la app (AES-256-GCM)
  note_bidx       CHAR(64)     NULL,                 -- HMAC del texto: evita duplicar al re-importar
  external_code   VARCHAR(40)  NULL,                 -- código del sistema anterior (opcional)
  import_batch_id CHAR(36)     NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_clinical_note_patient (tenant_id, patient_id, note_date),
  KEY ix_clinical_note_external (tenant_id, external_code),
  CONSTRAINT fk_clinical_note_tenant  FOREIGN KEY (tenant_id)       REFERENCES tenant(id),
  CONSTRAINT fk_clinical_note_patient FOREIGN KEY (patient_id)      REFERENCES patient(id),
  CONSTRAINT fk_clinical_note_doctor  FOREIGN KEY (doctor_id)       REFERENCES doctor(id),
  CONSTRAINT fk_clinical_note_batch   FOREIGN KEY (import_batch_id) REFERENCES import_batch(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------- Claves naturales para re-importar ----------
ALTER TABLE doctor
  ADD COLUMN code VARCHAR(30) NULL AFTER user_id,
  ADD KEY ix_doctor_code (tenant_id, code);

ALTER TABLE appointment
  ADD COLUMN external_code VARCHAR(40) NULL AFTER notes,
  ADD KEY ix_appt_external (tenant_id, external_code);

ALTER TABLE budget
  ADD COLUMN external_code VARCHAR(40) NULL AFTER notes,
  ADD KEY ix_budget_external (tenant_id, external_code);
