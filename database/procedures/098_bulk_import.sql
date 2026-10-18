-- =====================================================================
-- Carga masiva (sólo durante el periodo de implementación de la clínica)
--
-- Flujo: la app lee el archivo, valida cada fila (zod) y resuelve las referencias con
-- sp_import_context. Luego envía las filas válidas en bloques JSON a sp_import_<entidad>.
-- Cada sp_import_* vuelve a verificar la fase de la clínica (sp__import_assert) y el
-- aislamiento multi-tenant de todos los ids recibidos.
--
-- Las filas llegan con los datos sensibles ya cifrados por la app (*_enc) y el blind index
-- del documento (*_bidx), igual que en el alta desde la ficha. Las claves con valor null
-- se omiten del JSON: JSON_EXTRACT devuelve NULL.
-- =====================================================================
DELIMITER $$

-- La clínica debe estar en Implementación y dentro del periodo (±1 día de tolerancia por zona horaria;
-- la app aplica la regla exacta con la fecha local de la clínica)
DROP PROCEDURE IF EXISTS sp__import_assert $$
CREATE PROCEDURE sp__import_assert(IN p_tenant_id CHAR(36))
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM tenant t JOIN master_item s ON s.id = t.status_id
       WHERE t.id = p_tenant_id AND t.deleted_at IS NULL AND s.code = 'IMPLEMENTATION'
         AND t.implementation_start IS NOT NULL AND t.implementation_end IS NOT NULL
         AND UTC_DATE() >= t.implementation_start - INTERVAL 1 DAY
         AND UTC_DATE() <= t.implementation_end + INTERVAL 1 DAY) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:IMPORT_NOT_AVAILABLE';
  END IF;
END $$

-- Valida en bloque que todos los valores de una clave del JSON (p. ej. sexId) sean ítems del catálogo indicado
DROP PROCEDURE IF EXISTS sp__import_check_master $$
CREATE PROCEDURE sp__import_check_master(IN p_tenant_id CHAR(36), IN p_rows JSON, IN p_key VARCHAR(60), IN p_table_code VARCHAR(60))
BEGIN
  IF EXISTS (
      SELECT 1 FROM JSON_TABLE(COALESCE(JSON_EXTRACT(p_rows, CONCAT('$[*].', p_key)), JSON_ARRAY()), '$[*]'
                               COLUMNS (v CHAR(36) COLLATE utf8mb4_0900_ai_ci PATH '$')) jt
       WHERE jt.v IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
          WHERE mi.id = jt.v AND mt.code = p_table_code AND mi.deleted_at IS NULL
            AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE';
  END IF;
END $$

-- Datos para validar y resolver referencias. Siempre 11 result sets (vacíos si la entidad no los usa):
--  1 clínica y límites  2 doctores  3 convenios  4 servicios  5 tarifarios  6 pacientes  7 citas
--  8 presupuestos  9 notas de historia clínica  10 precios por tarifario  11 sedes
DROP PROCEDURE IF EXISTS sp_import_context $$
CREATE PROCEDURE sp_import_context(IN p_tenant_id CHAR(36), IN p_entity VARCHAR(30))
BEGIN
  SELECT s.code AS status_code, t.implementation_start, t.implementation_end, t.implementation_max_patients,
         pl.max_patients AS plan_max_patients, t.patient_form_mode, t.timezone, cur.code AS currency_code,
         (SELECT COUNT(*) FROM patient p WHERE p.tenant_id = t.id AND p.deleted_at IS NULL) AS patient_count
    FROM tenant t
    JOIN master_item s ON s.id = t.status_id
    JOIN plan pl ON pl.id = t.plan_id
    JOIN master_item cur ON cur.id = t.currency_id
   WHERE t.id = p_tenant_id;

  SELECT id, code, license_number, email, first_name, last_name, is_active, specialty_id, phone_enc, agenda_color, birth_date
    FROM doctor WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT id, code, name, is_active FROM agreement WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT id, code, name, price, is_active FROM service WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT id, code, name, group_name, is_default, is_active FROM price_list WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  SELECT id, record_number, doc_number_bidx, first_name, last_name, price_list_id, titular_patient_id
    FROM patient
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL
     AND p_entity IN ('PATIENTS', 'CLINICAL_NOTES', 'APPOINTMENTS', 'BUDGETS');

  SELECT a.id, a.external_code, a.patient_id, a.doctor_id, a.start_at, a.end_at, st.code AS status_code
    FROM appointment a JOIN master_item st ON st.id = a.status_id
   WHERE a.tenant_id = p_tenant_id AND a.deleted_at IS NULL AND p_entity = 'APPOINTMENTS';

  SELECT b.id, b.external_code, st.code AS status_code, st.name AS status_name FROM budget b JOIN master_item st ON st.id = b.status_id
   WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND b.external_code IS NOT NULL AND p_entity = 'BUDGETS';

  SELECT id, external_code, patient_id, note_date, note_bidx FROM patient_clinical_note
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND p_entity = 'CLINICAL_NOTES';

  SELECT i.price_list_id, i.service_id, i.price FROM price_list_item i
   WHERE i.tenant_id = p_tenant_id AND i.deleted_at IS NULL AND p_entity IN ('BUDGETS', 'PRICE_LIST_ITEMS');

  SELECT id, code, name, is_main, is_active FROM branch WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
END $$

-- ---------------- Historial ----------------
DROP PROCEDURE IF EXISTS sp_import_batch_start $$
CREATE PROCEDURE sp_import_batch_start(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_entity_code VARCHAR(60),
  IN p_file_name VARCHAR(255), IN p_sha256 CHAR(64), IN p_total_rows INT)
BEGIN
  DECLARE v_entity CHAR(36); DECLARE v_status CHAR(36);
  CALL sp__import_assert(p_tenant_id);
  CALL sp__master_id('IMPORT_ENTITY', p_entity_code, p_tenant_id, v_entity);
  CALL sp__master_id('IMPORT_STATUS', 'PROCESSING', p_tenant_id, v_status);
  INSERT INTO import_batch (id, tenant_id, entity_id, status_id, file_name, file_sha256, total_rows, created_by, updated_by)
  VALUES (p_id, p_tenant_id, v_entity, v_status, p_file_name, p_sha256, p_total_rows, p_actor_id, p_actor_id);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'import_batch', p_id, 'CREATE',
       JSON_OBJECT('entity', p_entity_code, 'file', p_file_name, 'rows', p_total_rows), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_import_batch_finish $$
CREATE PROCEDURE sp_import_batch_finish(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_status_code VARCHAR(60),
  IN p_ok_rows INT, IN p_error_rows INT, IN p_created_rows INT, IN p_updated_rows INT, IN p_duration_ms INT, IN p_errors JSON)
BEGIN
  DECLARE v_status CHAR(36);
  CALL sp__master_id('IMPORT_STATUS', p_status_code, p_tenant_id, v_status);
  IF NOT EXISTS (SELECT 1 FROM import_batch WHERE id = p_id AND tenant_id = p_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE import_batch
     SET status_id = v_status, ok_rows = p_ok_rows, error_rows = p_error_rows, created_rows = p_created_rows,
         updated_rows = p_updated_rows, duration_ms = p_duration_ms, errors = p_errors, finished_at = UTC_TIMESTAMP(3),
         updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'import_batch', p_id, 'IMPORT',
       JSON_OBJECT('status', p_status_code, 'ok', p_ok_rows, 'errors', p_error_rows, 'created', p_created_rows,
                   'updated', p_updated_rows, 'ms', p_duration_ms), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_import_batch_list $$
CREATE PROCEDURE sp_import_batch_list(IN p_tenant_id CHAR(36), IN p_limit INT)
BEGIN
  SELECT b.id, en.code AS entity_code, en.name AS entity_name, st.code AS status_code, st.name AS status_name,
         st.value AS status_color, b.file_name, b.total_rows, b.ok_rows, b.error_rows, b.created_rows, b.updated_rows,
         b.duration_ms, b.created_at, b.finished_at, u.full_name AS created_by_name, (u.tenant_id IS NULL) AS by_platform
    FROM import_batch b
    JOIN master_item en ON en.id = b.entity_id
    JOIN master_item st ON st.id = b.status_id
    LEFT JOIN app_user u ON u.id = b.created_by
   WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
   ORDER BY b.created_at DESC
   LIMIT p_limit;
END $$

-- ---------------- 1. Doctores (reutiliza sp_doctor_save; conserva el usuario vinculado) ----------------
DROP PROCEDURE IF EXISTS sp_import_doctors $$
CREATE PROCEDURE sp_import_doctors(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON; DECLARE v_id CHAR(36); DECLARE v_user CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);
  SET n = JSON_LENGTH(p_rows);
  START TRANSACTION;
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.id'));
    SET v_user = NULL;
    SELECT user_id INTO v_user FROM doctor WHERE id = v_id AND tenant_id = p_tenant_id;
    CALL sp_doctor_save(p_tenant_id, p_actor_id, p_ip, v_id, v_user, JSON_UNQUOTE(JSON_EXTRACT(r, '$.firstName')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.lastName')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.licenseNumber')),
         JSON_UNQUOTE(JSON_EXTRACT(r, '$.specialtyId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.email')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.phoneEnc')), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.agendaColor')), '#0E7490'),
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.isActive')), 1), JSON_UNQUOTE(JSON_EXTRACT(r, '$.birthDate')));
    IF JSON_UNQUOTE(JSON_EXTRACT(r, '$.code')) IS NOT NULL THEN
      UPDATE doctor SET code = NULL WHERE tenant_id = p_tenant_id AND code = JSON_UNQUOTE(JSON_EXTRACT(r, '$.code')) AND id <> v_id AND deleted_at IS NOT NULL;
    END IF;
    UPDATE doctor SET code = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.code')), code) WHERE id = v_id AND tenant_id = p_tenant_id;
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 2. Convenios (reutiliza sp_agreement_save) ----------------
DROP PROCEDURE IF EXISTS sp_import_agreements $$
CREATE PROCEDURE sp_import_agreements(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);
  SET n = JSON_LENGTH(p_rows);
  START TRANSACTION;
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    CALL sp_agreement_save(p_tenant_id, p_actor_id, p_ip, JSON_UNQUOTE(JSON_EXTRACT(r, '$.id')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.code')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.name')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.companyName')),
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.discountPct')), 0), JSON_UNQUOTE(JSON_EXTRACT(r, '$.validFrom')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.validTo')), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.requiresMemberCode')), 0),
         JSON_UNQUOTE(JSON_EXTRACT(r, '$.notes')), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.isActive')), 1));
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 3a. Servicios (reutiliza sp_service_save). Categoría por id o por nombre (se crea si no existe) ----------------
DROP PROCEDURE IF EXISTS sp_import_services $$
CREATE PROCEDURE sp_import_services(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON; DECLARE v_cat CHAR(36); DECLARE v_cat_name VARCHAR(150);
  DECLARE v_table CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);
  SELECT id INTO v_table FROM master_table WHERE code = 'SERVICE_CATEGORY';
  SET n = JSON_LENGTH(p_rows);
  START TRANSACTION;
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_cat = JSON_UNQUOTE(JSON_EXTRACT(r, '$.categoryId'));
    SET v_cat_name = TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.categoryName')));
    IF v_cat IS NULL AND COALESCE(v_cat_name, '') <> '' THEN
      SELECT mi.id INTO v_cat FROM master_item mi
       WHERE mi.master_table_id = v_table AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id) AND mi.deleted_at IS NULL
         AND (mi.name = v_cat_name OR mi.code = v_cat_name)
       ORDER BY mi.tenant_id IS NULL LIMIT 1;
      IF v_cat IS NULL THEN
        SET v_cat = UUID();
        INSERT INTO master_item (id, master_table_id, tenant_id, code, name, sort_order, is_system, is_active, created_by, updated_by)
        VALUES (v_cat, v_table, p_tenant_id, LEFT(UPPER(REGEXP_REPLACE(v_cat_name, '[^A-Za-z0-9]+', '_')), 40), LEFT(v_cat_name, 150),
                100, 0, 1, p_actor_id, p_actor_id);
        CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'master_item', v_cat, 'CREATE',
             JSON_OBJECT('table', 'SERVICE_CATEGORY', 'name', v_cat_name, 'source', 'import', 'batchId', p_batch_id), p_ip);
      END IF;
    END IF;
    CALL sp_service_save(p_tenant_id, p_actor_id, p_ip, JSON_UNQUOTE(JSON_EXTRACT(r, '$.id')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.code')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.name')), v_cat,
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.currencyCode')), 'PEN'), JSON_UNQUOTE(JSON_EXTRACT(r, '$.price')), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.requiresLab')), 0), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.perPiece')), 1),
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.isActive')), 1));
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 3b. Precios por tarifario (crea el tarifario si el código no existe; reutiliza sp_price_list_item_set) ----------------
DROP PROCEDURE IF EXISTS sp_import_price_list_items $$
CREATE PROCEDURE sp_import_price_list_items(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON; DECLARE v_list CHAR(36); DECLARE v_code VARCHAR(30);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);
  SET n = JSON_LENGTH(p_rows);
  START TRANSACTION;
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_code = UPPER(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListCode'))));
    SET v_list = NULL;
    SELECT id INTO v_list FROM price_list WHERE tenant_id = p_tenant_id AND code = v_code AND deleted_at IS NULL LIMIT 1;
    IF v_list IS NULL THEN
      SET v_list = UUID();
      INSERT INTO price_list (id, tenant_id, branch_id, code, name, group_name, is_default, is_active, created_by, updated_by)
      VALUES (v_list, p_tenant_id, NULL, v_code, COALESCE(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListName'))), ''), v_code),
              NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.groupName'))), ''), 0, 1, p_actor_id, p_actor_id);
      CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'price_list', v_list, 'CREATE',
           JSON_OBJECT('code', v_code, 'source', 'import', 'batchId', p_batch_id), p_ip);
    END IF;
    CALL sp_price_list_item_set(p_tenant_id, p_actor_id, p_ip, v_list, JSON_UNQUOTE(JSON_EXTRACT(r, '$.serviceId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.price')));
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 4. Pacientes ----------------
-- Mismas reglas que sp_patient_save (catálogos, convenio por id o nombre, apoderado obligatorio para menores,
-- documento único, límites del plan y de la implementación) más:
--   * N° de historia clínica del sistema anterior (record_number); si viene vacío se usa el correlativo.
--     El correlativo se adelanta al mayor N° numérico importado para no repetirlos.
--   * En pacientes existentes, las celdas vacías NO borran datos (COALESCE).
--   * Titular (dependientes) en una segunda pasada: puede ser otro paciente del mismo archivo.
DROP PROCEDURE IF EXISTS sp_import_patients $$
CREATE PROCEDURE sp_import_patients(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON;
  DECLARE v_id CHAR(36); DECLARE v_owner CHAR(36); DECLARE v_rec VARCHAR(20); DECLARE v_seq INT; DECLARE v_max_legacy BIGINT;
  DECLARE v_count INT; DECLARE v_plan_max INT; DECLARE v_impl_max INT; DECLARE v_is_impl TINYINT;
  DECLARE v_agreement CHAR(36); DECLARE v_ag_name VARCHAR(150); DECLARE v_ag_seq INT; DECLARE v_bidx CHAR(64);
  DECLARE v_titular CHAR(36); DECLARE v_first VARCHAR(100); DECLARE v_last VARCHAR(100); DECLARE v_mother VARCHAR(100);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);

  START TRANSACTION;
  -- Bloquea la fila de la clínica: dos cargas (o una carga y un alta) simultáneas no pueden pasar el límite de pacientes
  SELECT pl.max_patients, t.implementation_max_patients, (s.code = 'IMPLEMENTATION')
    INTO v_plan_max, v_impl_max, v_is_impl
    FROM tenant t JOIN plan pl ON pl.id = t.plan_id JOIN master_item s ON s.id = t.status_id WHERE t.id = p_tenant_id FOR UPDATE OF t;
  SELECT COUNT(*) INTO v_count FROM patient WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  -- Catálogos: validación en bloque (una consulta por columna, no por fila)
  CALL sp__import_check_master(p_tenant_id, p_rows, 'docTypeId', 'DOC_TYPE');
  CALL sp__import_check_master(p_tenant_id, p_rows, 'guardianDocTypeId', 'DOC_TYPE');
  CALL sp__import_check_master(p_tenant_id, p_rows, 'sexId', 'SEX');
  CALL sp__import_check_master(p_tenant_id, p_rows, 'guardianRelationshipId', 'GUARDIAN_RELATIONSHIP');
  CALL sp__import_check_master(p_tenant_id, p_rows, 'titularRelationshipId', 'GUARDIAN_RELATIONSHIP');
  CALL sp__import_check_master(p_tenant_id, p_rows, 'districtId', 'UBIGEO_DISTRICT');
  -- Ningún id puede pertenecer a otra clínica
  IF EXISTS (SELECT 1 FROM JSON_TABLE(p_rows, '$[*]' COLUMNS (id CHAR(36) COLLATE utf8mb4_0900_ai_ci PATH '$.id')) jt
              JOIN patient p ON p.id = jt.id WHERE p.tenant_id <> p_tenant_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;

  -- Adelanta el correlativo de H.C. al mayor N° numérico importado de hasta 6 dígitos (formato del correlativo).
  -- Los N° más largos se guardan tal cual pero no mueven el correlativo.
  SELECT MAX(CAST(jt.rec AS UNSIGNED)) INTO v_max_legacy
    FROM JSON_TABLE(p_rows, '$[*]' COLUMNS (rec VARCHAR(20) COLLATE utf8mb4_0900_ai_ci PATH '$.recordNumber')) jt
   WHERE jt.rec REGEXP '^[0-9]{1,6}$';
  IF v_max_legacy IS NOT NULL THEN
    INSERT IGNORE INTO tenant_sequence (tenant_id, seq_code, current_value, created_by, updated_by)
    VALUES (p_tenant_id, 'PATIENT_RECORD', 0, p_actor_id, p_actor_id);
    UPDATE tenant_sequence SET current_value = GREATEST(current_value, v_max_legacy), updated_by = p_actor_id
     WHERE tenant_id = p_tenant_id AND seq_code = 'PATIENT_RECORD';
  END IF;

  SET n = JSON_LENGTH(p_rows);
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.id'));
    SET v_rec = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.recordNumber'))), '');
    SET v_bidx = JSON_UNQUOTE(JSON_EXTRACT(r, '$.docNumberBidx'));
    SET v_first = TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.firstName'))); SET v_last = TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.lastName'))); SET v_mother = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.motherLastName'))), '');
    IF JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListId')) IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM price_list WHERE id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListId')) AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PRICE_LIST_NOT_FOUND';
    END IF;
    SET v_agreement = JSON_UNQUOTE(JSON_EXTRACT(r, '$.agreementId'));
    IF v_agreement IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM agreement WHERE id = v_agreement AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:AGREEMENT_NOT_VALID';
    END IF;
    IF v_bidx IS NOT NULL AND EXISTS (
        SELECT 1 FROM patient WHERE tenant_id = p_tenant_id AND doc_number_bidx = v_bidx AND id <> v_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_DOC_TAKEN';
    END IF;
    -- El índice único (tenant, record_number) incluye pacientes eliminados
    IF v_rec IS NOT NULL AND EXISTS (SELECT 1 FROM patient WHERE tenant_id = p_tenant_id AND record_number = v_rec AND id <> v_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:RECORD_NUMBER_TAKEN';
    END IF;
    -- Convenio escrito que no existe: se crea en el maestro (igual que en la ficha)
    SET v_ag_name = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.agreementName'))), '');
    IF v_agreement IS NULL AND v_ag_name IS NOT NULL THEN
      SELECT id INTO v_agreement FROM agreement
       WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND name = v_ag_name ORDER BY is_active DESC LIMIT 1;
      IF v_agreement IS NULL THEN
        SET v_agreement = UUID();
        CALL sp__next_sequence(p_tenant_id, 'AGREEMENT', p_actor_id, v_ag_seq);
        INSERT INTO agreement (id, tenant_id, code, name, discount_pct, is_active, created_by, updated_by)
        VALUES (v_agreement, p_tenant_id, CONCAT('CV', LPAD(v_ag_seq, 4, '0')), v_ag_name, 0, 1, p_actor_id, p_actor_id);
        CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'agreement', v_agreement, 'CREATE',
             JSON_OBJECT('name', v_ag_name, 'source', 'import', 'batchId', p_batch_id), p_ip);
      END IF;
    END IF;

    SET v_owner = NULL;
    SELECT tenant_id INTO v_owner FROM patient WHERE id = v_id;
    IF v_owner IS NULL THEN
      IF v_plan_max IS NOT NULL AND v_count >= v_plan_max THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_PATIENT_LIMIT'; END IF;
      IF v_is_impl = 1 AND v_impl_max IS NOT NULL AND v_count >= v_impl_max THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:IMPLEMENTATION_PATIENT_LIMIT';
      END IF;
      IF v_rec IS NULL THEN
        CALL sp__next_sequence(p_tenant_id, 'PATIENT_RECORD', p_actor_id, v_seq);
        SET v_rec = IF(v_seq > 999999, CAST(v_seq AS CHAR), LPAD(v_seq, 6, '0'));
      END IF;
      INSERT INTO patient (id, tenant_id, record_number, doc_type_id, doc_number_enc, doc_number_bidx, first_name, last_name, mother_last_name,
                           birth_date, sex_id, phone_enc, mobile_enc, email_enc, address_enc, district_id, insurance_company,
                           allergies_enc, medical_history_enc, notes_enc, is_active, requires_guardian, guardian_name,
                           guardian_relationship_id, guardian_doc_type_id, guardian_doc_number_enc, guardian_phone_enc,
                           agreement_id, agreement_member_code, price_list_id, created_by, updated_by)
      VALUES (v_id, p_tenant_id, v_rec, JSON_UNQUOTE(JSON_EXTRACT(r, '$.docTypeId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.docNumberEnc')), v_bidx, v_first, v_last, v_mother,
              JSON_UNQUOTE(JSON_EXTRACT(r, '$.birthDate')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.sexId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.phoneEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.mobileEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.emailEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.addressEnc')),
              JSON_UNQUOTE(JSON_EXTRACT(r, '$.districtId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.insuranceCompany')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.allergiesEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.medicalHistoryEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.notesEnc')),
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.isActive')), 1), COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.requiresGuardian')), 0), NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianName'))), ''),
              JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianRelationshipId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianDocTypeId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianDocNumberEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianPhoneEnc')),
              v_agreement, IF(v_agreement IS NULL, NULL, NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.agreementMemberCode'))), '')),
              JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListId')), p_actor_id, p_actor_id);
      SET v_count = v_count + 1;
    ELSE
      UPDATE patient
         SET record_number = COALESCE(v_rec, record_number),
             doc_type_id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.docTypeId')), doc_type_id), doc_number_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.docNumberEnc')), doc_number_enc),
             doc_number_bidx = COALESCE(v_bidx, doc_number_bidx), first_name = v_first, last_name = v_last,
             mother_last_name = COALESCE(v_mother, mother_last_name), birth_date = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.birthDate')), birth_date),
             sex_id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.sexId')), sex_id), phone_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.phoneEnc')), phone_enc),
             mobile_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.mobileEnc')), mobile_enc), email_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.emailEnc')), email_enc),
             address_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.addressEnc')), address_enc), district_id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.districtId')), district_id),
             insurance_company = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.insuranceCompany')), insurance_company),
             allergies_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.allergiesEnc')), allergies_enc),
             medical_history_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.medicalHistoryEnc')), medical_history_enc),
             notes_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.notesEnc')), notes_enc), is_active = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.isActive')), is_active),
             requires_guardian = GREATEST(requires_guardian, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.requiresGuardian')), 0)),
             guardian_name = COALESCE(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianName'))), ''), guardian_name),
             guardian_relationship_id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianRelationshipId')), guardian_relationship_id),
             guardian_doc_type_id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianDocTypeId')), guardian_doc_type_id),
             guardian_doc_number_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianDocNumberEnc')), guardian_doc_number_enc),
             guardian_phone_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.guardianPhoneEnc')), guardian_phone_enc),
             agreement_id = COALESCE(v_agreement, agreement_id),
             agreement_member_code = COALESCE(NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(r, '$.agreementMemberCode'))), ''), agreement_member_code),
             price_list_id = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListId')), price_list_id), updated_by = p_actor_id
       WHERE id = v_id AND tenant_id = p_tenant_id;
    END IF;
    -- Menor de edad => requiere apoderado (nombre y parentesco obligatorios), como en la ficha
    UPDATE patient
       SET requires_guardian = IF(requires_guardian = 1 OR (birth_date IS NOT NULL AND TIMESTAMPDIFF(YEAR, birth_date, UTC_DATE()) < 18), 1, 0)
     WHERE id = v_id;
    IF EXISTS (SELECT 1 FROM patient WHERE id = v_id AND requires_guardian = 1
                 AND (COALESCE(TRIM(guardian_name), '') = '' OR guardian_relationship_id IS NULL)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:GUARDIAN_REQUIRED';
    END IF;
    IF EXISTS (SELECT 1 FROM patient WHERE id = v_id AND requires_guardian = 1
                 AND (LOWER(TRIM(guardian_name)) = LOWER(TRIM(CONCAT(first_name, ' ', last_name)))
                      OR LOWER(TRIM(guardian_name)) = LOWER(TRIM(CONCAT_WS(' ', first_name, last_name, mother_last_name))))) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:GUARDIAN_SAME_AS_PATIENT';
    END IF;
    UPDATE patient
       SET guardian_name = NULL, guardian_relationship_id = NULL, guardian_doc_type_id = NULL, guardian_doc_number_enc = NULL,
           guardian_phone_enc = NULL, guardian_email_enc = NULL
     WHERE id = v_id AND requires_guardian = 0;
    CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient', v_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
         JSON_OBJECT('name', CONCAT(v_first, ' ', v_last), 'source', 'import', 'batchId', p_batch_id), p_ip);
    SET i = i + 1;
  END WHILE;

  -- Segunda pasada: titular (dependientes)
  SET i = 0;
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.id'));
    SET v_titular = JSON_UNQUOTE(JSON_EXTRACT(r, '$.titularPatientId'));
    IF v_titular IS NOT NULL THEN
      IF v_titular = v_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:TITULAR_SAME_AS_PATIENT'; END IF;
      IF NOT EXISTS (SELECT 1 FROM patient WHERE id = v_titular AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
      END IF;
      IF EXISTS (SELECT 1 FROM patient WHERE id = v_titular AND titular_patient_id = v_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:TITULAR_CYCLE';
      END IF;
      UPDATE patient SET titular_patient_id = v_titular, titular_relationship_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.titularRelationshipId')), updated_by = p_actor_id
       WHERE id = v_id AND tenant_id = p_tenant_id;
    END IF;
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 5. Historia clínica: notas de evolución + antecedentes / alergias del paciente ----------------
DROP PROCEDURE IF EXISTS sp_import_clinical_notes $$
CREATE PROCEDURE sp_import_clinical_notes(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_notes JSON, IN p_patients JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON; DECLARE v_id CHAR(36); DECLARE v_owner CHAR(36);
  DECLARE v_patient CHAR(36); DECLARE v_doctor CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);
  START TRANSACTION;
  -- Antecedentes y alergias van a los campos existentes de la ficha (cifrados)
  SET n = JSON_LENGTH(COALESCE(p_patients, JSON_ARRAY()));
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_patients, CONCAT('$[', i, ']'));
    SET v_patient = JSON_UNQUOTE(JSON_EXTRACT(r, '$.patientId'));
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = v_patient AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
    END IF;
    UPDATE patient SET allergies_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.allergiesEnc')), allergies_enc),
           medical_history_enc = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.medicalHistoryEnc')), medical_history_enc), updated_by = p_actor_id
     WHERE id = v_patient AND tenant_id = p_tenant_id;
    CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient', v_patient, 'UPDATE',
         JSON_OBJECT('fields', 'antecedentes', 'source', 'import', 'batchId', p_batch_id), p_ip);
    SET i = i + 1;
  END WHILE;

  SET i = 0;
  SET n = JSON_LENGTH(COALESCE(p_notes, JSON_ARRAY()));
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_notes, CONCAT('$[', i, ']'));
    SET v_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.id')); SET v_patient = JSON_UNQUOTE(JSON_EXTRACT(r, '$.patientId')); SET v_doctor = JSON_UNQUOTE(JSON_EXTRACT(r, '$.doctorId'));
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = v_patient AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
    END IF;
    IF v_doctor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM doctor WHERE id = v_doctor AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
    END IF;
    SET v_owner = NULL;
    SELECT tenant_id INTO v_owner FROM patient_clinical_note WHERE id = v_id;
    IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
    IF v_owner IS NULL THEN
      INSERT INTO patient_clinical_note (id, tenant_id, patient_id, note_date, doctor_id, note_enc, note_bidx, external_code,
                                         import_batch_id, created_by, updated_by)
      VALUES (v_id, p_tenant_id, v_patient, JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteDate')), v_doctor, JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteEnc')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteBidx')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode')),
              p_batch_id, p_actor_id, p_actor_id);
    ELSE
      UPDATE patient_clinical_note
         SET patient_id = v_patient, note_date = JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteDate')), doctor_id = v_doctor, note_enc = JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteEnc')),
             note_bidx = JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteBidx')), external_code = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode')), external_code),
             import_batch_id = p_batch_id, updated_by = p_actor_id
       WHERE id = v_id AND tenant_id = p_tenant_id;
    END IF;
    CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient_clinical_note', v_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
         JSON_OBJECT('patientId', v_patient, 'date', JSON_UNQUOTE(JSON_EXTRACT(r, '$.noteDate')), 'source', 'import', 'batchId', p_batch_id), p_ip);
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 6. Citas ----------------
-- Regla de choques para datos importados: las citas PASADAS (historial) se cargan aunque se crucen,
-- porque el sistema anterior pudo permitirlo. Las citas FUTURAS activas (no canceladas / no asistió)
-- siguen la misma regla que la agenda: el doctor no puede tener dos citas a la vez.
DROP PROCEDURE IF EXISTS sp_import_appointments $$
CREATE PROCEDURE sp_import_appointments(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON; DECLARE v_id CHAR(36); DECLARE v_owner CHAR(36);
  DECLARE v_status CHAR(36); DECLARE v_status_code VARCHAR(60); DECLARE v_branch CHAR(36);
  DECLARE v_patient CHAR(36); DECLARE v_doctor CHAR(36); DECLARE v_start DATETIME(3); DECLARE v_end DATETIME(3);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__import_assert(p_tenant_id);
  SET n = JSON_LENGTH(p_rows);
  START TRANSACTION;
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.id')); SET v_patient = JSON_UNQUOTE(JSON_EXTRACT(r, '$.patientId')); SET v_doctor = JSON_UNQUOTE(JSON_EXTRACT(r, '$.doctorId'));
    SET v_start = JSON_UNQUOTE(JSON_EXTRACT(r, '$.startAt')); SET v_end = JSON_UNQUOTE(JSON_EXTRACT(r, '$.endAt')); SET v_status_code = JSON_UNQUOTE(JSON_EXTRACT(r, '$.statusCode'));
    CALL sp__master_id('APPOINTMENT_STATUS', v_status_code, p_tenant_id, v_status);
    CALL sp__branch_resolve(p_tenant_id, JSON_UNQUOTE(JSON_EXTRACT(r, '$.branchId')), v_branch);
    IF v_end <= v_start THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_RANGE'; END IF;
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = v_patient AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM doctor WHERE id = v_doctor AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
    END IF;
    IF v_start >= UTC_TIMESTAMP(3) AND v_status_code NOT IN ('CANCELLED', 'NO_SHOW') AND EXISTS (
        SELECT 1 FROM appointment a JOIN master_item s ON s.id = a.status_id
         WHERE a.tenant_id = p_tenant_id AND a.doctor_id = v_doctor AND a.id <> v_id AND a.deleted_at IS NULL
           AND s.code NOT IN ('CANCELLED', 'NO_SHOW') AND a.start_at < v_end AND a.end_at > v_start) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:APPOINTMENT_OVERLAP';
    END IF;
    SET v_owner = NULL;
    SELECT tenant_id INTO v_owner FROM appointment WHERE id = v_id;
    IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
    IF v_owner IS NOT NULL THEN
      UPDATE appointment SET patient_id = v_patient, doctor_id = v_doctor, branch_id = v_branch, start_at = v_start, end_at = v_end,
             status_id = v_status, reason = JSON_UNQUOTE(JSON_EXTRACT(r, '$.reason')), notes = JSON_UNQUOTE(JSON_EXTRACT(r, '$.notes')),
             external_code = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode')), external_code), updated_by = p_actor_id
       WHERE id = v_id AND tenant_id = p_tenant_id;
    ELSE
      IF JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode')) IS NOT NULL THEN
        UPDATE appointment SET external_code = NULL
         WHERE tenant_id = p_tenant_id AND external_code = JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode')) AND deleted_at IS NOT NULL;
      END IF;
      INSERT INTO appointment (id, tenant_id, patient_id, doctor_id, branch_id, start_at, end_at, status_id, reason, notes,
                               external_code, created_by, updated_by)
      VALUES (v_id, p_tenant_id, v_patient, v_doctor, v_branch, v_start, v_end, v_status, JSON_UNQUOTE(JSON_EXTRACT(r, '$.reason')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.notes')),
              JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode')), p_actor_id, p_actor_id);
    END IF;
    CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'appointment', v_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
         JSON_OBJECT('patientId', v_patient, 'doctorId', v_doctor, 'start', v_start, 'status', v_status_code,
                     'source', 'import', 'batchId', p_batch_id), p_ip);
    SET i = i + 1;
  END WHILE;
  COMMIT;
END $$

-- ---------------- 7. Presupuestos (reutiliza sp_budget_save: correlativo, totales, odontograma y auditoría) ----------------
-- Cada presupuesto se guarda por separado (sp_budget_save tiene su propia transacción). Un error en uno no detiene
-- los demás: al final se devuelve {failures: [{id, error}]} para informar fila por fila.
-- Re-importar: sólo se actualizan borradores, y se conservan odontograma, convenio, sede y seguro del existente.
-- p_can_edit: el usuario tiene budgets.edit (modificar presupuestos guardados).
DROP PROCEDURE IF EXISTS sp_import_budgets $$
CREATE PROCEDURE sp_import_budgets(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_batch_id CHAR(36), IN p_rows JSON,
                                   IN p_can_edit TINYINT)
BEGIN
  DECLARE i INT DEFAULT 0; DECLARE n INT; DECLARE r JSON; DECLARE v_id CHAR(36); DECLARE v_ext VARCHAR(40);
  DECLARE v_failures JSON DEFAULT JSON_ARRAY(); DECLARE v_err VARCHAR(255);
  DECLARE v_exists TINYINT; DECLARE v_status VARCHAR(60); DECLARE v_marks JSON; DECLARE v_agreement CHAR(36); DECLARE v_branch CHAR(36);
  DECLARE v_insurance VARCHAR(150); DECLARE v_deductible DECIMAL(12,2); DECLARE v_coins DECIMAL(5,2);
  CALL sp__import_assert(p_tenant_id);
  SET n = JSON_LENGTH(p_rows);
  WHILE i < n DO
    SET r = JSON_EXTRACT(p_rows, CONCAT('$[', i, ']'));
    SET v_id = JSON_UNQUOTE(JSON_EXTRACT(r, '$.id'));
    SET v_ext = JSON_UNQUOTE(JSON_EXTRACT(r, '$.externalCode'));
    SET v_err = NULL;
    BEGIN
      DECLARE CONTINUE HANDLER FOR SQLEXCEPTION
        BEGIN
          GET DIAGNOSTICS CONDITION 1 v_err = MESSAGE_TEXT;
          IF v_err IS NULL OR v_err NOT LIKE 'APP:%' THEN SET v_err = 'APP:INTERNAL'; END IF;
        END;
      SET v_exists = 0; SET v_status = NULL; SET v_agreement = NULL; SET v_branch = NULL; SET v_insurance = NULL;
      SET v_deductible = 0; SET v_coins = 0; SET v_marks = JSON_ARRAY();
      SELECT 1, st.code, b.agreement_id, b.branch_id, b.insurance_company, b.deductible, b.coinsurance_pct
        INTO v_exists, v_status, v_agreement, v_branch, v_insurance, v_deductible, v_coins
        FROM budget b JOIN master_item st ON st.id = b.status_id
       WHERE b.id = v_id AND b.tenant_id = p_tenant_id AND b.deleted_at IS NULL;
      IF v_exists = 1 AND v_status <> 'DRAFT' THEN
        SET v_err = 'APP:IMPORT_BUDGET_ISSUED';
      ELSEIF v_exists = 1 AND COALESCE(p_can_edit, 0) = 0 THEN
        SET v_err = 'APP:BUDGET_EDIT_FORBIDDEN';
      ELSE
        IF v_exists = 1 THEN
          SELECT COALESCE(JSON_ARRAYAGG(JSON_OBJECT('toothCode', m.tooth_code, 'surface', m.surface, 'conditionId', m.condition_id, 'notes', m.notes)), JSON_ARRAY())
            INTO v_marks
            FROM odontogram o JOIN odontogram_mark m ON m.odontogram_id = o.id AND m.deleted_at IS NULL
           WHERE o.budget_id = v_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL;
        ELSEIF v_ext IS NOT NULL THEN
          -- El código externo de un presupuesto eliminado se libera (índice único)
          UPDATE budget SET external_code = NULL WHERE tenant_id = p_tenant_id AND external_code = v_ext AND deleted_at IS NOT NULL;
        END IF;
        CALL sp_budget_save(p_tenant_id, p_actor_id, p_ip, v_id, JSON_UNQUOTE(JSON_EXTRACT(r, '$.patientId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.doctorId')), JSON_UNQUOTE(JSON_EXTRACT(r, '$.budgetDate')),
             JSON_UNQUOTE(JSON_EXTRACT(r, '$.statusCode')), v_insurance, v_deductible, v_coins, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(r, '$.discount')), 0), JSON_UNQUOTE(JSON_EXTRACT(r, '$.notes')),
             JSON_EXTRACT(r, '$.items'), v_marks, v_agreement, COALESCE(p_can_edit, 0), v_branch, JSON_UNQUOTE(JSON_EXTRACT(r, '$.priceListId')));
        IF v_err IS NULL THEN
          UPDATE budget SET external_code = v_ext WHERE id = v_id AND tenant_id = p_tenant_id;
        END IF;
      END IF;
    END;
    IF v_err IS NOT NULL THEN
      SET v_failures = JSON_ARRAY_APPEND(v_failures, '$', JSON_OBJECT('id', v_id, 'error', v_err));
    END IF;
    SET i = i + 1;
  END WHILE;
  SELECT v_failures AS failures;
END $$

-- ---------------- Historia clínica en la ficha (sólo lectura) ----------------
DROP PROCEDURE IF EXISTS sp_patient_clinical_note_list $$
CREATE PROCEDURE sp_patient_clinical_note_list(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_patient_id CHAR(36))
BEGIN
  SELECT n.id, n.note_date, n.note_enc, n.doctor_id, CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
         n.external_code, n.import_batch_id IS NOT NULL AS imported, n.created_at
    FROM patient_clinical_note n
    LEFT JOIN doctor d ON d.id = n.doctor_id
   WHERE n.tenant_id = p_tenant_id AND n.patient_id = p_patient_id AND n.deleted_at IS NULL
   ORDER BY n.note_date DESC, n.created_at DESC
   LIMIT 1000;
  -- Lectura de datos clínicos sensibles: queda en la bitácora
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient_clinical_note', p_patient_id, 'VIEW', NULL, p_ip);
END $$

DELIMITER ;
