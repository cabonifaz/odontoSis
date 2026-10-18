-- =====================================================================
-- Presupuestos + odontograma
-- Los totales se calculan SIEMPRE en el servidor (no se confía en el cliente).
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_budget_list $$
CREATE PROCEDURE sp_budget_list(
  IN p_tenant_id CHAR(36), IN p_search VARCHAR(100), IN p_patient_id CHAR(36), IN p_status_code VARCHAR(60),
  IN p_limit INT, IN p_offset INT)
BEGIN
  SELECT b.id, b.budget_number, b.budget_date, b.valid_until, b.patient_id,
         CONCAT(p.last_name, ', ', p.first_name) AS patient_name, p.record_number,
         CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
         st.code AS status_code, st.name AS status_name, st.value AS status_color,
         cur.value AS currency_symbol, b.total, b.updated_at,
         COUNT(*) OVER () AS total_count
    FROM budget b
    JOIN patient p ON p.id = b.patient_id
    LEFT JOIN doctor d ON d.id = b.doctor_id
    JOIN master_item st ON st.id = b.status_id
    JOIN master_item cur ON cur.id = b.currency_id
   WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL
     AND (p_patient_id IS NULL OR b.patient_id = p_patient_id)
     AND (p_status_code IS NULL OR p_status_code = '' OR st.code = p_status_code)
     AND (p_search IS NULL OR p_search = '' OR b.budget_number = p_search OR p.record_number = p_search
          OR CONCAT(p.first_name, ' ', p.last_name) LIKE CONCAT('%', p_search, '%')
          OR CONCAT(p.last_name, ' ', p.first_name) LIKE CONCAT('%', p_search, '%'))
   ORDER BY b.budget_date DESC, b.budget_number DESC
   LIMIT p_limit OFFSET p_offset;
END $$

-- 3 result sets: cabecera, ítems, marcas del odontograma
DROP PROCEDURE IF EXISTS sp_budget_get $$
CREATE PROCEDURE sp_budget_get(IN p_tenant_id CHAR(36), IN p_id CHAR(36))
BEGIN
  SELECT b.id, b.budget_number, b.budget_date, b.valid_until, b.patient_id, b.doctor_id,
         p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.record_number, p.doc_number_enc,
         p.birth_date AS patient_birth_date, p.requires_guardian, p.guardian_name, gr.name AS guardian_relationship_name,
         gdt.code AS guardian_doc_type_code, p.guardian_doc_number_enc,
         dt.code AS doc_type_code, CONCAT(d.first_name, ' ', d.last_name) AS doctor_name, d.license_number AS doctor_license,
         st.code AS status_code, st.name AS status_name, st.value AS status_color,
         cur.code AS currency_code, cur.value AS currency_symbol,
         b.insurance_company, b.deductible, b.coinsurance_pct, b.subtotal, b.discount, b.total, b.notes,
         b.agreement_id, b.agreement_name, b.agreement_discount_pct, p.agreement_member_code,
         b.branch_id, br.name AS branch_name, br.address AS branch_address, br.phone AS branch_phone,
         b.price_list_id, b.price_list_name, p.mother_last_name AS patient_mother_last_name,
         b.created_at, b.updated_at,
         (SELECT o.id FROM odontogram o WHERE o.budget_id = b.id AND o.deleted_at IS NULL LIMIT 1) AS odontogram_id,
         t.trade_name AS tenant_name, t.legal_name AS tenant_legal_name, t.tax_id AS tenant_tax_id,
         t.address AS tenant_address, t.phone AS tenant_phone, t.logo_file_id AS tenant_logo_file_id,
         t.budget_notes AS tenant_budget_notes,
         (SELECT s.code FROM master_item s WHERE s.id = t.status_id) AS tenant_status_code
    FROM budget b
    JOIN tenant t ON t.id = b.tenant_id
    LEFT JOIN branch br ON br.id = b.branch_id
    JOIN patient p ON p.id = b.patient_id
    LEFT JOIN master_item dt ON dt.id = p.doc_type_id
    LEFT JOIN master_item gr ON gr.id = p.guardian_relationship_id
    LEFT JOIN master_item gdt ON gdt.id = p.guardian_doc_type_id
    LEFT JOIN doctor d ON d.id = b.doctor_id
    JOIN master_item st ON st.id = b.status_id
    JOIN master_item cur ON cur.id = b.currency_id
   WHERE b.id = p_id AND b.tenant_id = p_tenant_id AND b.deleted_at IS NULL;

  SELECT bi.id, bi.tooth_code, bi.surfaces, bi.service_id, bi.description, bi.quantity, bi.unit_price,
         bi.deductible, bi.coinsurance, bi.total, bi.sort_order
    FROM budget_item bi
    JOIN budget b ON b.id = bi.budget_id AND b.tenant_id = p_tenant_id
   WHERE bi.budget_id = p_id AND bi.deleted_at IS NULL
   ORDER BY bi.sort_order;

  SELECT m.id, m.tooth_code, m.surface, m.condition_id, c.code AS condition_code, m.notes
    FROM odontogram_mark m
    JOIN odontogram o ON o.id = m.odontogram_id AND o.tenant_id = p_tenant_id AND o.deleted_at IS NULL
    JOIN master_item c ON c.id = m.condition_id
   WHERE o.budget_id = p_id AND m.deleted_at IS NULL;
END $$

-- Reemplaza las marcas de un odontograma a partir de un JSON [{toothCode, surface, conditionId, notes}]
DROP PROCEDURE IF EXISTS sp__odontogram_marks_replace $$
CREATE PROCEDURE sp__odontogram_marks_replace(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_odontogram_id CHAR(36), IN p_marks JSON)
BEGIN
  IF EXISTS (
      SELECT 1 FROM JSON_TABLE(COALESCE(p_marks, JSON_ARRAY()), '$[*]' COLUMNS (condition_id CHAR(36) COLLATE utf8mb4_0900_ai_ci PATH '$.conditionId')) jt
       WHERE NOT EXISTS (SELECT 1 FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
                          WHERE mi.id = jt.condition_id AND mt.code = 'TOOTH_CONDITION'
                            AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE';
  END IF;
  UPDATE odontogram_mark SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE odontogram_id = p_odontogram_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  INSERT INTO odontogram_mark (id, tenant_id, odontogram_id, tooth_code, surface, condition_id, notes, created_by, updated_by)
  SELECT UUID(), p_tenant_id, p_odontogram_id, jt.tooth_code, NULLIF(jt.surface, ''), jt.condition_id, jt.notes, p_actor_id, p_actor_id
    FROM JSON_TABLE(COALESCE(p_marks, JSON_ARRAY()), '$[*]' COLUMNS (
           tooth_code   VARCHAR(4) COLLATE utf8mb4_0900_ai_ci   PATH '$.toothCode',
           surface      VARCHAR(2) COLLATE utf8mb4_0900_ai_ci   PATH '$.surface',
           condition_id CHAR(36) COLLATE utf8mb4_0900_ai_ci     PATH '$.conditionId',
           notes        VARCHAR(255) COLLATE utf8mb4_0900_ai_ci PATH '$.notes')) jt;
END $$

-- Guarda cabecera + ítems + odontograma en una transacción (upsert idempotente por id)
DROP PROCEDURE IF EXISTS sp_budget_save $$
CREATE PROCEDURE sp_budget_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_patient_id CHAR(36),
  IN p_doctor_id CHAR(36), IN p_budget_date DATE, IN p_status_code VARCHAR(60), IN p_insurance VARCHAR(150),
  IN p_deductible DECIMAL(12,2), IN p_coinsurance_pct DECIMAL(5,2), IN p_discount DECIMAL(12,2), IN p_notes TEXT,
  IN p_items JSON, IN p_marks JSON, IN p_agreement_id CHAR(36), IN p_can_edit TINYINT, IN p_branch_id CHAR(36),
  IN p_price_list_id CHAR(36))
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_status CHAR(36); DECLARE v_cur CHAR(36); DECLARE v_days INT;
  DECLARE v_ag_pct DECIMAL(5,2) DEFAULT 0; DECLARE v_ag_name VARCHAR(150) DEFAULT NULL; DECLARE v_branch CHAR(36);
  DECLARE v_seq INT; DECLARE v_subtotal DECIMAL(12,2); DECLARE v_odg CHAR(36) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  CALL sp__master_id('BUDGET_STATUS', p_status_code, p_tenant_id, v_status);
  SELECT currency_id, budget_validity_days INTO v_cur, v_days FROM tenant WHERE id = p_tenant_id;
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM doctor WHERE id = p_doctor_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
  END IF;
  IF JSON_LENGTH(COALESCE(p_items, JSON_ARRAY())) = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BUDGET_EMPTY'; END IF;
  -- Convenio vigente a la fecha del presupuesto (el % se guarda como copia)
  CALL sp__agreement_for_date(p_tenant_id, p_agreement_id, p_budget_date, v_ag_pct, v_ag_name);
  CALL sp__branch_resolve(p_tenant_id, p_branch_id, v_branch);
  IF p_price_list_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM price_list WHERE id = p_price_list_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PRICE_LIST_NOT_FOUND';
  END IF;
  -- Los servicios referenciados deben ser del tenant
  IF EXISTS (
      SELECT 1 FROM JSON_TABLE(p_items, '$[*]' COLUMNS (service_id CHAR(36) COLLATE utf8mb4_0900_ai_ci PATH '$.serviceId')) jt
       WHERE jt.service_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM service s WHERE s.id = jt.service_id AND s.tenant_id = p_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:SERVICE_NOT_FOUND';
  END IF;
  -- Ningún id de ítem puede pertenecer a otro presupuesto
  IF EXISTS (
      SELECT 1 FROM JSON_TABLE(p_items, '$[*]' COLUMNS (id CHAR(36) COLLATE utf8mb4_0900_ai_ci PATH '$.id')) jt
       JOIN budget_item bi ON bi.id = jt.id WHERE bi.budget_id <> p_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FORBIDDEN';
  END IF;
  SELECT tenant_id INTO v_owner FROM budget WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  -- Sin permiso de edición sólo se crean borradores: no se puede emitir un presupuesto ya aprobado
  IF v_owner IS NULL AND COALESCE(p_can_edit, 0) = 0 AND p_status_code <> 'DRAFT' THEN
    CALL sp__master_id('BUDGET_STATUS', 'DRAFT', p_tenant_id, v_status);
  END IF;
  -- Crear requiere budgets.write (validado en la app); modificar uno existente requiere budgets.edit
  IF v_owner IS NOT NULL AND COALESCE(p_can_edit, 0) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BUDGET_EDIT_FORBIDDEN';
  END IF;

  START TRANSACTION;
  IF v_owner IS NULL THEN
    CALL sp__next_sequence(p_tenant_id, 'BUDGET', p_actor_id, v_seq);
    INSERT INTO budget (id, tenant_id, budget_number, patient_id, doctor_id, branch_id, budget_date, valid_until, status_id, currency_id,
                        insurance_company, deductible, coinsurance_pct, agreement_id, agreement_name, agreement_discount_pct,
                        discount, notes, created_by, updated_by)
    VALUES (p_id, p_tenant_id, LPAD(v_seq, 6, '0'), p_patient_id, p_doctor_id, v_branch, p_budget_date, p_budget_date + INTERVAL v_days DAY,
            v_status, v_cur, p_insurance, COALESCE(p_deductible, 0), COALESCE(p_coinsurance_pct, 0), p_agreement_id, v_ag_name, v_ag_pct,
            COALESCE(p_discount, 0), p_notes, p_actor_id, p_actor_id);
  ELSE
    UPDATE budget
       SET patient_id = p_patient_id, doctor_id = p_doctor_id, branch_id = v_branch, budget_date = p_budget_date,
           valid_until = p_budget_date + INTERVAL v_days DAY, status_id = v_status, insurance_company = p_insurance,
           deductible = COALESCE(p_deductible, 0), coinsurance_pct = COALESCE(p_coinsurance_pct, 0),
           agreement_id = p_agreement_id, agreement_name = v_ag_name, agreement_discount_pct = v_ag_pct,
           discount = COALESCE(p_discount, 0), notes = p_notes, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  END IF;

  UPDATE budget_item SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE budget_id = p_id AND deleted_at IS NULL;

  INSERT INTO budget_item (id, tenant_id, budget_id, tooth_code, surfaces, service_id, description, quantity, unit_price,
                           deductible, coinsurance, total, sort_order, created_by, updated_by)
  SELECT jt.id, p_tenant_id, p_id, NULLIF(jt.tooth_code, ''), NULLIF(jt.surfaces, ''), jt.service_id, jt.description,
         GREATEST(COALESCE(jt.quantity, 1), 0.01), GREATEST(jt.unit_price, 0),
         ROUND(COALESCE(jt.deductible, 0), 2), ROUND(COALESCE(jt.coinsurance, 0), 2),
         ROUND(GREATEST(COALESCE(jt.quantity, 1), 0.01) * GREATEST(jt.unit_price, 0) * (1 - v_ag_pct / 100), 2), jt.ord - 1, p_actor_id, p_actor_id
    FROM JSON_TABLE(p_items, '$[*]' COLUMNS (
           ord         FOR ORDINALITY,
           id          CHAR(36) COLLATE utf8mb4_0900_ai_ci      PATH '$.id',
           tooth_code  VARCHAR(4) COLLATE utf8mb4_0900_ai_ci    PATH '$.toothCode',
           surfaces    VARCHAR(10) COLLATE utf8mb4_0900_ai_ci   PATH '$.surfaces',
           service_id  CHAR(36) COLLATE utf8mb4_0900_ai_ci      PATH '$.serviceId',
           description VARCHAR(250) COLLATE utf8mb4_0900_ai_ci  PATH '$.description',
           quantity    DECIMAL(10,2) PATH '$.quantity',
           unit_price  DECIMAL(12,2) PATH '$.unitPrice',
           deductible  DECIMAL(12,2) PATH '$.deductible',
           coinsurance DECIMAL(12,2) PATH '$.coinsurance')) jt
  ON DUPLICATE KEY UPDATE tooth_code = VALUES(tooth_code), surfaces = VALUES(surfaces), service_id = VALUES(service_id),
         description = VALUES(description), quantity = VALUES(quantity), unit_price = VALUES(unit_price),
         deductible = VALUES(deductible), coinsurance = VALUES(coinsurance), total = VALUES(total),
         sort_order = VALUES(sort_order), deleted_at = NULL, deleted_by = NULL, updated_by = p_actor_id;

  UPDATE budget SET price_list_id = p_price_list_id,
         price_list_name = (SELECT name FROM price_list WHERE id = p_price_list_id) WHERE id = p_id;
  SELECT COALESCE(SUM(total), 0) INTO v_subtotal FROM budget_item WHERE budget_id = p_id AND deleted_at IS NULL;
  UPDATE budget SET subtotal = v_subtotal, total = GREATEST(v_subtotal - discount, 0) WHERE id = p_id;

  SELECT id INTO v_odg FROM odontogram WHERE budget_id = p_id AND deleted_at IS NULL LIMIT 1;
  IF v_odg IS NULL THEN
    SET v_odg = UUID();
    INSERT INTO odontogram (id, tenant_id, patient_id, budget_id, odontogram_date, created_by, updated_by)
    VALUES (v_odg, p_tenant_id, p_patient_id, p_id, p_budget_date, p_actor_id, p_actor_id);
  ELSE
    UPDATE odontogram SET patient_id = p_patient_id, odontogram_date = p_budget_date, updated_by = p_actor_id WHERE id = v_odg;
  END IF;
  CALL sp__odontogram_marks_replace(p_tenant_id, p_actor_id, v_odg, p_marks);

  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'budget', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('patientId', p_patient_id, 'status', p_status_code, 'items', JSON_LENGTH(p_items), 'subtotal', v_subtotal,
                   'agreement', v_ag_name, 'agreementPct', v_ag_pct), p_ip);
  COMMIT;
  SELECT id, budget_number, subtotal, total, updated_at FROM budget WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS sp_budget_status_set $$
CREATE PROCEDURE sp_budget_status_set(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_status_code VARCHAR(60))
BEGIN
  DECLARE v_status CHAR(36);
  CALL sp__master_id('BUDGET_STATUS', p_status_code, p_tenant_id, v_status);
  IF NOT EXISTS (SELECT 1 FROM budget WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE budget SET status_id = v_status, updated_by = p_actor_id WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'budget', p_id, 'STATUS', JSON_OBJECT('status', p_status_code), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_budget_delete $$
CREATE PROCEDURE sp_budget_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM budget WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE budget SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'budget', p_id, 'DELETE', NULL, p_ip);
END $$

-- Odontograma general del paciente (estado actual, no ligado a presupuesto)
DROP PROCEDURE IF EXISTS sp_odontogram_patient_get $$
CREATE PROCEDURE sp_odontogram_patient_get(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT m.id, m.tooth_code, m.surface, m.condition_id, c.code AS condition_code, m.notes, o.updated_at
    FROM odontogram o
    JOIN odontogram_mark m ON m.odontogram_id = o.id AND m.deleted_at IS NULL
    JOIN master_item c ON c.id = m.condition_id
   WHERE o.tenant_id = p_tenant_id AND o.patient_id = p_patient_id AND o.budget_id IS NULL AND o.deleted_at IS NULL;
END $$

DROP PROCEDURE IF EXISTS sp_odontogram_patient_save $$
CREATE PROCEDURE sp_odontogram_patient_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_patient_id CHAR(36), IN p_marks JSON)
BEGIN
  DECLARE v_odg CHAR(36) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
  START TRANSACTION;
  SELECT id INTO v_odg FROM odontogram
   WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id AND budget_id IS NULL AND deleted_at IS NULL LIMIT 1;
  IF v_odg IS NULL THEN
    SET v_odg = UUID();
    INSERT INTO odontogram (id, tenant_id, patient_id, budget_id, odontogram_date, created_by, updated_by)
    VALUES (v_odg, p_tenant_id, p_patient_id, NULL, UTC_DATE(), p_actor_id, p_actor_id);
  ELSE
    UPDATE odontogram SET odontogram_date = UTC_DATE(), updated_by = p_actor_id WHERE id = v_odg;
  END IF;
  CALL sp__odontogram_marks_replace(p_tenant_id, p_actor_id, v_odg, p_marks);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'odontogram', v_odg, 'UPDATE',
       JSON_OBJECT('patientId', p_patient_id, 'marks', JSON_LENGTH(COALESCE(p_marks, JSON_ARRAY()))), p_ip);
  COMMIT;
END $$

DELIMITER ;
