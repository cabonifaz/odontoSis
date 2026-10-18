-- =====================================================================
-- Derivaciones (referral) y cartas de garantía (guarantee_letter) de la ficha del paciente.
-- Toda operación filtra por p_tenant_id (aislamiento multi-tenant) y valida que el paciente,
-- los doctores y el presupuesto pertenezcan a la clínica.
-- =====================================================================
DELIMITER $$

-- Valida que el paciente exista y pertenezca a la clínica
DROP PROCEDURE IF EXISTS sp__rg_patient_check $$
CREATE PROCEDURE sp__rg_patient_check(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  IF p_patient_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
END $$

-- Valida (si no es NULL) que el doctor exista y pertenezca a la clínica
DROP PROCEDURE IF EXISTS sp__rg_doctor_check $$
CREATE PROCEDURE sp__rg_doctor_check(IN p_tenant_id CHAR(36), IN p_doctor_id CHAR(36))
BEGIN
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM doctor WHERE id = p_doctor_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
  END IF;
END $$

-- ---------------- Derivaciones ----------------
DROP PROCEDURE IF EXISTS sp_referral_list $$
CREATE PROCEDURE sp_referral_list(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT r.id, r.patient_id, r.from_doctor_id, CONCAT(fd.first_name, ' ', fd.last_name) AS from_doctor_name,
         r.referral_date, r.specialty_id, sp.name AS specialty_name, r.referred_to_name, r.referred_to_contact,
         r.is_internal, r.to_doctor_id, CONCAT(td.first_name, ' ', td.last_name) AS to_doctor_name,
         r.reason, r.clinical_notes, st.code AS status_code, st.name AS status_name, st.value AS status_color,
         r.response_notes, r.created_at, r.updated_at
    FROM referral r
    JOIN master_item st ON st.id = r.status_id
    LEFT JOIN master_item sp ON sp.id = r.specialty_id
    LEFT JOIN doctor fd ON fd.id = r.from_doctor_id
    LEFT JOIN doctor td ON td.id = r.to_doctor_id
   WHERE r.tenant_id = p_tenant_id AND r.patient_id = p_patient_id AND r.deleted_at IS NULL
   ORDER BY r.referral_date DESC, r.created_at DESC;
END $$

-- Hoja de derivación para imprimir: derivación + paciente + doctor + datos de la clínica
DROP PROCEDURE IF EXISTS sp_referral_get $$
CREATE PROCEDURE sp_referral_get(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36), IN p_id CHAR(36))
BEGIN
  SELECT r.id, r.patient_id, r.referral_date, r.specialty_id, sp.name AS specialty_name,
         r.referred_to_name, r.referred_to_contact, r.is_internal, r.to_doctor_id,
         CONCAT(td.first_name, ' ', td.last_name) AS to_doctor_name, td.license_number AS to_doctor_license,
         r.reason, r.clinical_notes, st.code AS status_code, st.name AS status_name, st.value AS status_color,
         r.response_notes, r.created_at, r.updated_at,
         p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.record_number,
         p.birth_date AS patient_birth_date, dt.code AS doc_type_code, p.doc_number_enc,
         p.insurance_company AS patient_insurance_company,
         r.from_doctor_id, CONCAT(fd.first_name, ' ', fd.last_name) AS doctor_name, fd.license_number AS doctor_license,
         fsp.name AS doctor_specialty_name,
         t.trade_name AS tenant_name, t.legal_name AS tenant_legal_name, t.tax_id AS tenant_tax_id,
         t.address AS tenant_address, t.phone AS tenant_phone, t.logo_file_id AS tenant_logo_file_id,
         (SELECT s.code FROM master_item s WHERE s.id = t.status_id) AS tenant_status_code
    FROM referral r
    JOIN tenant t ON t.id = r.tenant_id
    JOIN patient p ON p.id = r.patient_id AND p.tenant_id = r.tenant_id
    JOIN master_item st ON st.id = r.status_id
    LEFT JOIN master_item dt ON dt.id = p.doc_type_id
    LEFT JOIN master_item sp ON sp.id = r.specialty_id
    LEFT JOIN doctor fd ON fd.id = r.from_doctor_id
    LEFT JOIN master_item fsp ON fsp.id = fd.specialty_id
    LEFT JOIN doctor td ON td.id = r.to_doctor_id
   WHERE r.id = p_id AND r.tenant_id = p_tenant_id AND r.patient_id = p_patient_id AND r.deleted_at IS NULL;
END $$

-- Upsert idempotente (el id lo genera el cliente)
DROP PROCEDURE IF EXISTS sp_referral_save $$
CREATE PROCEDURE sp_referral_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_patient_id CHAR(36),
  IN p_from_doctor_id CHAR(36), IN p_referral_date DATE, IN p_specialty_id CHAR(36),
  IN p_referred_to_name VARCHAR(200), IN p_referred_to_contact VARCHAR(200), IN p_is_internal TINYINT,
  IN p_to_doctor_id CHAR(36), IN p_reason TEXT, IN p_clinical_notes TEXT, IN p_status_code VARCHAR(60),
  IN p_response_notes TEXT)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_owner_patient CHAR(36) DEFAULT NULL;
  DECLARE v_status CHAR(36); DECLARE v_to_name VARCHAR(200); DECLARE v_to_doctor CHAR(36);
  CALL sp__rg_patient_check(p_tenant_id, p_patient_id);
  CALL sp__rg_doctor_check(p_tenant_id, p_from_doctor_id);
  CALL sp__master_check('SPECIALTY', p_specialty_id, p_tenant_id);
  CALL sp__master_id('REFERRAL_STATUS', COALESCE(p_status_code, 'PENDING'), p_tenant_id, v_status);
  IF COALESCE(TRIM(p_reason), '') = '' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION'; END IF;

  -- Interna: a un doctor de la clínica (su nombre se copia). Externa: nombre del especialista/clínica obligatorio
  IF COALESCE(p_is_internal, 0) = 1 THEN
    IF p_to_doctor_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:REFERRAL_TARGET_REQUIRED'; END IF;
    CALL sp__rg_doctor_check(p_tenant_id, p_to_doctor_id);
    SET v_to_doctor = p_to_doctor_id;
    SELECT CONCAT(first_name, ' ', last_name) INTO v_to_name FROM doctor WHERE id = p_to_doctor_id;
  ELSE
    IF COALESCE(TRIM(p_referred_to_name), '') = '' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:REFERRAL_TARGET_REQUIRED'; END IF;
    SET v_to_doctor = NULL;
    SET v_to_name = TRIM(p_referred_to_name);
  END IF;

  SELECT tenant_id, patient_id INTO v_owner, v_owner_patient FROM referral WHERE id = p_id AND deleted_at IS NULL;
  IF v_owner IS NOT NULL AND (v_owner <> p_tenant_id OR v_owner_patient <> p_patient_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;

  IF v_owner IS NOT NULL THEN
    UPDATE referral SET from_doctor_id = p_from_doctor_id, referral_date = p_referral_date, specialty_id = p_specialty_id,
           referred_to_name = v_to_name, referred_to_contact = NULLIF(TRIM(p_referred_to_contact), ''),
           is_internal = COALESCE(p_is_internal, 0), to_doctor_id = v_to_doctor, reason = p_reason,
           clinical_notes = p_clinical_notes, status_id = v_status, response_notes = p_response_notes, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    INSERT INTO referral (id, tenant_id, patient_id, from_doctor_id, referral_date, specialty_id, referred_to_name,
                          referred_to_contact, is_internal, to_doctor_id, reason, clinical_notes, status_id, response_notes,
                          created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_patient_id, p_from_doctor_id, p_referral_date, p_specialty_id, v_to_name,
            NULLIF(TRIM(p_referred_to_contact), ''), COALESCE(p_is_internal, 0), v_to_doctor, p_reason, p_clinical_notes,
            v_status, p_response_notes, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'referral', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('patientId', p_patient_id, 'to', v_to_name, 'internal', COALESCE(p_is_internal, 0), 'status', p_status_code), p_ip);
  SELECT p_id AS id;
END $$

DROP PROCEDURE IF EXISTS sp_referral_delete $$
CREATE PROCEDURE sp_referral_delete(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_patient_id CHAR(36), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM referral WHERE id = p_id AND tenant_id = p_tenant_id AND patient_id = p_patient_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE referral SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'referral', p_id, 'DELETE', JSON_OBJECT('patientId', p_patient_id), p_ip);
END $$

-- ---------------- Cartas de garantía ----------------
DROP PROCEDURE IF EXISTS sp_guarantee_letter_list $$
CREATE PROCEDURE sp_guarantee_letter_list(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT g.id, g.patient_id, g.budget_id, b.budget_number, b.total AS budget_total, cur.value AS budget_currency_symbol,
         g.insurance_company, g.letter_number, g.request_date, g.response_date, g.amount_requested, g.amount_approved,
         g.coverage_pct, st.code AS status_code, st.name AS status_name, st.value AS status_color,
         g.valid_until, g.notes, g.created_at, g.updated_at
    FROM guarantee_letter g
    JOIN master_item st ON st.id = g.status_id
    LEFT JOIN budget b ON b.id = g.budget_id AND b.tenant_id = g.tenant_id AND b.deleted_at IS NULL
    LEFT JOIN master_item cur ON cur.id = b.currency_id
   WHERE g.tenant_id = p_tenant_id AND g.patient_id = p_patient_id AND g.deleted_at IS NULL
   ORDER BY g.request_date DESC, g.created_at DESC;
END $$

DROP PROCEDURE IF EXISTS sp_guarantee_letter_get $$
CREATE PROCEDURE sp_guarantee_letter_get(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36), IN p_id CHAR(36))
BEGIN
  SELECT g.id, g.patient_id, g.budget_id, b.budget_number, b.total AS budget_total, cur.value AS budget_currency_symbol,
         g.insurance_company, g.letter_number, g.request_date, g.response_date, g.amount_requested, g.amount_approved,
         g.coverage_pct, st.code AS status_code, st.name AS status_name, st.value AS status_color,
         g.valid_until, g.notes, g.created_at, g.updated_at,
         p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.record_number
    FROM guarantee_letter g
    JOIN patient p ON p.id = g.patient_id
    JOIN master_item st ON st.id = g.status_id
    LEFT JOIN budget b ON b.id = g.budget_id AND b.tenant_id = g.tenant_id AND b.deleted_at IS NULL
    LEFT JOIN master_item cur ON cur.id = b.currency_id
   WHERE g.id = p_id AND g.tenant_id = p_tenant_id AND g.patient_id = p_patient_id AND g.deleted_at IS NULL;
END $$

DROP PROCEDURE IF EXISTS sp_guarantee_letter_save $$
CREATE PROCEDURE sp_guarantee_letter_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_patient_id CHAR(36),
  IN p_budget_id CHAR(36), IN p_insurance_company VARCHAR(150), IN p_letter_number VARCHAR(40), IN p_request_date DATE,
  IN p_response_date DATE, IN p_amount_requested DECIMAL(12,2), IN p_amount_approved DECIMAL(12,2),
  IN p_coverage_pct DECIMAL(5,2), IN p_status_code VARCHAR(60), IN p_valid_until DATE, IN p_notes TEXT)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_owner_patient CHAR(36) DEFAULT NULL; DECLARE v_status CHAR(36);
  CALL sp__rg_patient_check(p_tenant_id, p_patient_id);
  CALL sp__master_id('GUARANTEE_LETTER_STATUS', COALESCE(p_status_code, 'DRAFT'), p_tenant_id, v_status);
  IF COALESCE(TRIM(p_insurance_company), '') = '' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION'; END IF;
  -- El presupuesto (opcional) debe ser del mismo paciente y clínica
  IF p_budget_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM budget WHERE id = p_budget_id AND tenant_id = p_tenant_id AND patient_id = p_patient_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BUDGET_NOT_FOUND';
  END IF;
  IF COALESCE(p_amount_requested, 0) < 0 OR COALESCE(p_amount_approved, 0) < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PRICE';
  END IF;
  IF p_coverage_pct IS NOT NULL AND (p_coverage_pct < 0 OR p_coverage_pct > 100) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION';
  END IF;
  IF p_response_date IS NOT NULL AND p_response_date < p_request_date THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:GUARANTEE_DATES_INVALID';
  END IF;

  SELECT tenant_id, patient_id INTO v_owner, v_owner_patient FROM guarantee_letter WHERE id = p_id AND deleted_at IS NULL;
  IF v_owner IS NOT NULL AND (v_owner <> p_tenant_id OR v_owner_patient <> p_patient_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;

  IF v_owner IS NOT NULL THEN
    UPDATE guarantee_letter SET budget_id = p_budget_id, insurance_company = TRIM(p_insurance_company),
           letter_number = NULLIF(TRIM(p_letter_number), ''), request_date = p_request_date, response_date = p_response_date,
           amount_requested = COALESCE(p_amount_requested, 0), amount_approved = p_amount_approved, coverage_pct = p_coverage_pct,
           status_id = v_status, valid_until = p_valid_until, notes = p_notes, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    INSERT INTO guarantee_letter (id, tenant_id, patient_id, budget_id, insurance_company, letter_number, request_date,
                                  response_date, amount_requested, amount_approved, coverage_pct, status_id, valid_until, notes,
                                  created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_patient_id, p_budget_id, TRIM(p_insurance_company), NULLIF(TRIM(p_letter_number), ''),
            p_request_date, p_response_date, COALESCE(p_amount_requested, 0), p_amount_approved, p_coverage_pct, v_status,
            p_valid_until, p_notes, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'guarantee_letter', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('patientId', p_patient_id, 'budgetId', p_budget_id, 'insurance', p_insurance_company,
                   'requested', p_amount_requested, 'approved', p_amount_approved, 'status', p_status_code), p_ip);
  SELECT p_id AS id;
END $$

DROP PROCEDURE IF EXISTS sp_guarantee_letter_delete $$
CREATE PROCEDURE sp_guarantee_letter_delete(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_patient_id CHAR(36), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM guarantee_letter WHERE id = p_id AND tenant_id = p_tenant_id AND patient_id = p_patient_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE guarantee_letter SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'guarantee_letter', p_id, 'DELETE', JSON_OBJECT('patientId', p_patient_id), p_ip);
END $$

DELIMITER ;
