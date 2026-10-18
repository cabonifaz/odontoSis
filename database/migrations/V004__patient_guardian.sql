-- =====================================================================
-- V004 - Apoderado del paciente (menores de edad u otras personas que lo requieran)
-- Datos de contacto/identificación del apoderado cifrados en la app (*_enc).
-- =====================================================================
ALTER TABLE patient
  ADD COLUMN requires_guardian        TINYINT(1)   NOT NULL DEFAULT 0 AFTER coinsurance_pct,
  ADD COLUMN guardian_name            VARCHAR(200) NULL AFTER requires_guardian,
  ADD COLUMN guardian_relationship_id CHAR(36)     NULL AFTER guardian_name,
  ADD COLUMN guardian_doc_type_id     CHAR(36)     NULL AFTER guardian_relationship_id,
  ADD COLUMN guardian_doc_number_enc  VARCHAR(255) NULL AFTER guardian_doc_type_id,
  ADD COLUMN guardian_phone_enc       VARCHAR(255) NULL AFTER guardian_doc_number_enc,
  ADD COLUMN guardian_email_enc       VARCHAR(400) NULL AFTER guardian_phone_enc,
  ADD CONSTRAINT fk_patient_guardian_rel     FOREIGN KEY (guardian_relationship_id) REFERENCES master_item(id),
  ADD CONSTRAINT fk_patient_guardian_doctype FOREIGN KEY (guardian_doc_type_id)     REFERENCES master_item(id);

-- Catálogo de parentescos (maestro de maestros; las clínicas pueden agregar los suyos)
INSERT INTO master_table (id, code, name, description, tenant_editable, is_system)
VALUES (UUID(), 'GUARDIAN_RELATIONSHIP', 'Parentesco del apoderado', NULL, 1, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, NULL, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'MOTHER' code, 'Madre' name, 1 ord UNION ALL
    SELECT 'FATHER', 'Padre', 2 UNION ALL
    SELECT 'LEGAL_GUARDIAN', 'Tutor legal', 3 UNION ALL
    SELECT 'GRANDPARENT', 'Abuelo(a)', 4 UNION ALL
    SELECT 'SIBLING', 'Hermano(a)', 5 UNION ALL
    SELECT 'UNCLE_AUNT', 'Tío(a)', 6 UNION ALL
    SELECT 'SPOUSE', 'Cónyuge', 7 UNION ALL
    SELECT 'CHILD', 'Hijo(a)', 8 UNION ALL
    SELECT 'CAREGIVER', 'Cuidador(a)', 9 UNION ALL
    SELECT 'OTHER', 'Otro', 10
  ) v
 WHERE mt.code = 'GUARDIAN_RELATIONSHIP';
