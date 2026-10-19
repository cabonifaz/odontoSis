-- =====================================================================
-- Clínica: doctores, pacientes (clientes) y lista de precios (servicios)
-- Toda operación filtra por p_tenant_id (aislamiento multi-tenant).
-- Los campos *_enc llegan ya cifrados desde la aplicación.
-- =====================================================================
DELIMITER $$

-- ---------------- Doctores ----------------
DROP PROCEDURE IF EXISTS sp_doctor_list $$
CREATE PROCEDURE sp_doctor_list(IN p_tenant_id CHAR(36), IN p_include_inactive TINYINT)
BEGIN
  SELECT d.id, d.user_id, d.first_name, d.last_name, d.license_number, d.specialty_id, sp.name AS specialty_name,
         d.email, d.phone_enc, d.agenda_color, d.is_active, d.updated_at, u.email AS user_email, d.birth_date
    FROM doctor d
    LEFT JOIN master_item sp ON sp.id = d.specialty_id
    LEFT JOIN app_user u ON u.id = d.user_id
   WHERE d.tenant_id = p_tenant_id AND d.deleted_at IS NULL AND (p_include_inactive = 1 OR d.is_active = 1)
   ORDER BY d.last_name, d.first_name;
END $$

DROP PROCEDURE IF EXISTS sp_doctor_save $$
CREATE PROCEDURE sp_doctor_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_user_id CHAR(36),
  IN p_first_name VARCHAR(100), IN p_last_name VARCHAR(100), IN p_license VARCHAR(30), IN p_specialty_id CHAR(36),
  IN p_email VARCHAR(200), IN p_phone_enc VARCHAR(255), IN p_agenda_color VARCHAR(7), IN p_is_active TINYINT, IN p_birth_date DATE)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL;
  CALL sp__master_check('SPECIALTY', p_specialty_id, p_tenant_id);
  IF p_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app_user WHERE id = p_user_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:USER_NOT_FOUND';
  END IF;
  IF p_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM doctor WHERE user_id = p_user_id AND id <> p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:USER_ALREADY_LINKED';
  END IF;
  SELECT tenant_id INTO v_owner FROM doctor WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;

  IF v_owner IS NOT NULL THEN
    UPDATE doctor SET user_id = p_user_id, first_name = p_first_name, last_name = p_last_name, license_number = p_license,
           specialty_id = p_specialty_id, email = p_email, phone_enc = p_phone_enc, agenda_color = p_agenda_color,
           is_active = p_is_active, birth_date = p_birth_date, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    INSERT INTO doctor (id, tenant_id, user_id, first_name, last_name, license_number, specialty_id, email, phone_enc,
                        agenda_color, is_active, birth_date, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_user_id, p_first_name, p_last_name, p_license, p_specialty_id, p_email, p_phone_enc,
            p_agenda_color, p_is_active, p_birth_date, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'doctor', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('name', CONCAT(p_first_name, ' ', p_last_name), 'license', p_license, 'isActive', p_is_active), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_doctor_delete $$
CREATE PROCEDURE sp_doctor_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM doctor WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE doctor SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id, is_active = 0
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'doctor', p_id, 'DELETE', NULL, p_ip);
END $$

-- ---------------- Pacientes ----------------
DROP PROCEDURE IF EXISTS sp_patient_list $$
CREATE PROCEDURE sp_patient_list(
  IN p_tenant_id CHAR(36), IN p_search VARCHAR(100), IN p_doc_bidx CHAR(64), IN p_limit INT, IN p_offset INT)
BEGIN
  SELECT p.id, p.record_number, p.first_name, p.last_name, p.birth_date, p.doc_type_id, dt.code AS doc_type_code,
         p.doc_number_enc, p.phone_enc, p.insurance_company, p.is_active, p.updated_at, p.requires_guardian, p.guardian_name,
         p.mother_last_name, p.mobile_enc, COUNT(*) OVER () AS total_count
    FROM patient p
    LEFT JOIN master_item dt ON dt.id = p.doc_type_id
   WHERE p.tenant_id = p_tenant_id AND p.deleted_at IS NULL
     AND (p_doc_bidx IS NOT NULL AND p.doc_number_bidx = p_doc_bidx
          OR p_doc_bidx IS NULL AND (p_search IS NULL OR p_search = ''
              OR CONCAT_WS(' ', p.first_name, p.last_name, p.mother_last_name) LIKE CONCAT('%', p_search, '%')
              OR CONCAT_WS(' ', p.last_name, p.mother_last_name, p.first_name) LIKE CONCAT('%', p_search, '%')
              OR p.record_number = p_search))
   ORDER BY p.last_name, p.first_name
   LIMIT p_limit OFFSET p_offset;
END $$

DROP PROCEDURE IF EXISTS sp_patient_get $$
CREATE PROCEDURE sp_patient_get(IN p_tenant_id CHAR(36), IN p_id CHAR(36))
BEGIN
  SELECT p.id, p.record_number, p.doc_type_id, p.doc_number_enc, p.first_name, p.last_name, p.birth_date, p.sex_id,
         p.phone_enc, p.email_enc, p.address_enc, p.insurance_company, p.deductible, p.coinsurance_pct,
         p.allergies_enc, p.medical_history_enc, p.notes_enc, p.is_active, p.created_at, p.updated_at,
         (SELECT CASE COUNT(DISTINCT c.type_id) WHEN 0 THEN 'MISSING' WHEN (SELECT COUNT(*) FROM master_item ci JOIN master_table ct ON ct.id = ci.master_table_id WHERE ct.code = 'CONSENT_TYPE' AND ci.is_active = 1 AND ci.deleted_at IS NULL) THEN 'OK' ELSE 'PARTIAL' END
            FROM patient_consent c WHERE c.patient_id = p.id AND c.status = 'ACTIVE' AND c.deleted_at IS NULL) AS consent_status,
         p.requires_guardian, p.guardian_name, p.guardian_relationship_id, gr.name AS guardian_relationship_name,
         p.guardian_doc_type_id, gdt.code AS guardian_doc_type_code, p.guardian_doc_number_enc, p.guardian_phone_enc, p.guardian_email_enc,
         p.agreement_id, ag.name AS agreement_name, ag.discount_pct AS agreement_discount_pct, p.agreement_member_code,
         p.mother_last_name, p.mobile_enc, p.messaging_enc, p.marital_status_id, p.acquisition_source_id, p.card_number,
         p.district_id, dist.name AS district_name, prov.id AS province_id, prov.name AS province_name,
         dep.id AS department_id, dep.name AS department_name,
         p.home_branch_id, br.name AS home_branch_name, p.assigned_doctor_id, CONCAT(doc.first_name, ' ', doc.last_name) AS assigned_doctor_name,
         p.attention_type_id, att.name AS attention_type_name, p.price_list_id, pl.name AS price_list_name, pl.group_name AS price_list_group,
         p.titular_patient_id, CONCAT(tit.first_name, ' ', tit.last_name) AS titular_name, tit.record_number AS titular_record_number,
         p.titular_relationship_id, trel.name AS titular_relationship_name
    FROM patient p
    LEFT JOIN master_item dist ON dist.id = p.district_id
    LEFT JOIN master_item prov ON prov.id = dist.parent_id
    LEFT JOIN master_item dep ON dep.id = prov.parent_id
    LEFT JOIN branch br ON br.id = p.home_branch_id
    LEFT JOIN doctor doc ON doc.id = p.assigned_doctor_id
    LEFT JOIN master_item att ON att.id = p.attention_type_id
    LEFT JOIN price_list pl ON pl.id = p.price_list_id
    LEFT JOIN patient tit ON tit.id = p.titular_patient_id AND tit.deleted_at IS NULL
    LEFT JOIN master_item trel ON trel.id = p.titular_relationship_id
    LEFT JOIN agreement ag ON ag.id = p.agreement_id
    LEFT JOIN master_item gr ON gr.id = p.guardian_relationship_id
    LEFT JOIN master_item gdt ON gdt.id = p.guardian_doc_type_id
   WHERE p.id = p_id AND p.tenant_id = p_tenant_id AND p.deleted_at IS NULL;
END $$

-- Upsert idempotente (el id lo genera el cliente: permite sincronizar altas offline)
DROP PROCEDURE IF EXISTS sp_patient_save $$
CREATE PROCEDURE sp_patient_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36),
  IN p_doc_type_id CHAR(36), IN p_doc_number_enc VARCHAR(255), IN p_doc_number_bidx CHAR(64),
  IN p_first_name VARCHAR(100), IN p_last_name VARCHAR(100), IN p_birth_date DATE, IN p_sex_id CHAR(36),
  IN p_phone_enc VARCHAR(255), IN p_email_enc VARCHAR(400), IN p_address_enc VARCHAR(800),
  IN p_insurance VARCHAR(150), IN p_deductible DECIMAL(12,2), IN p_coinsurance DECIMAL(5,2),
  IN p_allergies_enc TEXT, IN p_medical_history_enc TEXT, IN p_notes_enc TEXT, IN p_is_active TINYINT,
  IN p_requires_guardian TINYINT, IN p_guardian_name VARCHAR(200), IN p_guardian_relationship_id CHAR(36),
  IN p_guardian_doc_type_id CHAR(36), IN p_guardian_doc_number_enc VARCHAR(255), IN p_guardian_phone_enc VARCHAR(255),
  IN p_guardian_email_enc VARCHAR(400), IN p_agreement_id CHAR(36), IN p_agreement_member_code VARCHAR(40),
  IN p_agreement_name VARCHAR(150), IN p_ext JSON)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_seq INT; DECLARE v_max INT; DECLARE v_count INT;
  DECLARE v_requires TINYINT; DECLARE v_agreement CHAR(36) DEFAULT NULL; DECLARE v_ag_seq INT;
  -- Ficha avanzada (opcionales): llegan en p_ext (JSON)
  DECLARE v_mother VARCHAR(100); DECLARE v_mobile VARCHAR(255); DECLARE v_msg VARCHAR(255);
  DECLARE v_marital CHAR(36); DECLARE v_acq CHAR(36); DECLARE v_card VARCHAR(40); DECLARE v_district CHAR(36);
  DECLARE v_branch CHAR(36); DECLARE v_doctor CHAR(36); DECLARE v_attention CHAR(36); DECLARE v_price_list CHAR(36);
  DECLARE v_titular CHAR(36); DECLARE v_titular_rel CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__master_check('DOC_TYPE', p_doc_type_id, p_tenant_id);
  CALL sp__master_check('SEX', p_sex_id, p_tenant_id);
  CALL sp__master_check('GUARDIAN_RELATIONSHIP', p_guardian_relationship_id, p_tenant_id);
  SET v_mother      = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.motherLastName'))), 'null');
  SET v_mobile      = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.mobileEnc')), 'null');
  SET v_msg         = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.messagingEnc')), 'null');
  SET v_marital     = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.maritalStatusId')), 'null');
  SET v_acq         = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.acquisitionSourceId')), 'null');
  SET v_card        = NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.cardNumber'))), 'null');
  SET v_district    = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.districtId')), 'null');
  SET v_branch      = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.homeBranchId')), 'null');
  SET v_doctor      = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.assignedDoctorId')), 'null');
  SET v_attention   = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.attentionTypeId')), 'null');
  SET v_price_list  = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.priceListId')), 'null');
  SET v_titular     = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.titularPatientId')), 'null');
  SET v_titular_rel = NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p_ext, '$.titularRelationshipId')), 'null');
  CALL sp__master_check('MARITAL_STATUS', v_marital, p_tenant_id);
  CALL sp__master_check('ACQUISITION_SOURCE', v_acq, p_tenant_id);
  CALL sp__master_check('UBIGEO_DISTRICT', v_district, p_tenant_id);
  CALL sp__master_check('ATTENTION_TYPE', v_attention, p_tenant_id);
  CALL sp__master_check('GUARDIAN_RELATIONSHIP', v_titular_rel, p_tenant_id);
  IF v_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branch WHERE id = v_branch AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BRANCH_NOT_FOUND';
  END IF;
  IF v_doctor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM doctor WHERE id = v_doctor AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
  END IF;
  IF v_price_list IS NOT NULL AND NOT EXISTS (SELECT 1 FROM price_list WHERE id = v_price_list AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PRICE_LIST_NOT_FOUND';
  END IF;
  -- Titular (dependientes): de la misma clínica, distinto del paciente y sin ciclos
  IF v_titular IS NOT NULL THEN
    IF v_titular = p_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:TITULAR_SAME_AS_PATIENT'; END IF;
    IF NOT EXISTS (SELECT 1 FROM patient WHERE id = v_titular AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
    END IF;
    IF EXISTS (SELECT 1 FROM patient WHERE id = v_titular AND titular_patient_id = p_id) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:TITULAR_CYCLE';
    END IF;
  END IF;
  CALL sp__master_check('DOC_TYPE', p_guardian_doc_type_id, p_tenant_id);
  -- Menor de edad => siempre requiere apoderado (nombre y parentesco obligatorios)
  SET v_requires = IF(COALESCE(p_requires_guardian, 0) = 1
                      OR (p_birth_date IS NOT NULL AND TIMESTAMPDIFF(YEAR, p_birth_date, UTC_DATE()) < 18), 1, 0);
  IF v_requires = 1 AND (COALESCE(TRIM(p_guardian_name), '') = '' OR p_guardian_relationship_id IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:GUARDIAN_REQUIRED';
  END IF;
  -- El apoderado no puede ser el mismo paciente (el documento cifrado se compara en la app)
  IF v_requires = 1 AND (LOWER(TRIM(p_guardian_name)) = LOWER(TRIM(CONCAT(p_first_name, ' ', p_last_name)))
      OR LOWER(TRIM(p_guardian_name)) = LOWER(TRIM(CONCAT_WS(' ', p_first_name, p_last_name, v_mother)))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:GUARDIAN_SAME_AS_PATIENT';
  END IF;
  -- Convenio: por id (del maestro) o por nombre escrito. Si el nombre no existe se crea en el maestro
  -- (comparación sin mayúsculas ni tildes por la collation ai_ci => sin duplicados). N° de socio opcional.
  SET v_agreement = p_agreement_id;
  IF v_agreement IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM agreement WHERE id = v_agreement AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:AGREEMENT_NOT_VALID';
  END IF;
  IF p_doc_number_bidx IS NOT NULL AND EXISTS (
      SELECT 1 FROM patient WHERE tenant_id = p_tenant_id AND doc_number_bidx = p_doc_number_bidx AND id <> p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_DOC_TAKEN';
  END IF;
  SELECT tenant_id INTO v_owner FROM patient WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;

  START TRANSACTION;
  IF v_agreement IS NULL AND COALESCE(TRIM(p_agreement_name), '') <> '' THEN
    SELECT id INTO v_agreement FROM agreement
     WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND name = TRIM(p_agreement_name)
     ORDER BY is_active DESC LIMIT 1;
    IF v_agreement IS NULL THEN
      SET v_agreement = UUID();
      CALL sp__next_sequence(p_tenant_id, 'AGREEMENT', p_actor_id, v_ag_seq);
      INSERT INTO agreement (id, tenant_id, code, name, discount_pct, is_active, created_by, updated_by)
      VALUES (v_agreement, p_tenant_id, CONCAT('CV', LPAD(v_ag_seq, 4, '0')), TRIM(p_agreement_name), 0, 1, p_actor_id, p_actor_id);
      CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'agreement', v_agreement, 'CREATE',
           JSON_OBJECT('name', TRIM(p_agreement_name), 'source', 'patient', 'patientId', p_id), p_ip);
    END IF;
  END IF;
  IF v_owner IS NOT NULL THEN
    UPDATE patient
       SET doc_type_id = p_doc_type_id, doc_number_enc = p_doc_number_enc, doc_number_bidx = p_doc_number_bidx,
           first_name = p_first_name, last_name = p_last_name, birth_date = p_birth_date, sex_id = p_sex_id,
           phone_enc = p_phone_enc, email_enc = p_email_enc, address_enc = p_address_enc, insurance_company = p_insurance,
           deductible = p_deductible, coinsurance_pct = p_coinsurance, allergies_enc = p_allergies_enc,
           medical_history_enc = p_medical_history_enc, notes_enc = p_notes_enc, is_active = p_is_active,
           requires_guardian = v_requires, guardian_name = IF(v_requires = 1, TRIM(p_guardian_name), NULL),
           guardian_relationship_id = IF(v_requires = 1, p_guardian_relationship_id, NULL),
           guardian_doc_type_id = IF(v_requires = 1, p_guardian_doc_type_id, NULL),
           guardian_doc_number_enc = IF(v_requires = 1, p_guardian_doc_number_enc, NULL),
           guardian_phone_enc = IF(v_requires = 1, p_guardian_phone_enc, NULL),
           guardian_email_enc = IF(v_requires = 1, p_guardian_email_enc, NULL),
           agreement_id = v_agreement,
           agreement_member_code = IF(v_agreement IS NULL, NULL, NULLIF(TRIM(p_agreement_member_code), '')),
           updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    -- Bloquea la fila de la clínica: dos altas simultáneas no pueden pasar ambas el límite de pacientes
    SELECT p.max_patients INTO v_max FROM tenant t JOIN plan p ON p.id = t.plan_id WHERE t.id = p_tenant_id FOR UPDATE OF t;
    SELECT COUNT(*) INTO v_count FROM patient WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
    IF v_max IS NOT NULL AND v_count >= v_max THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_PATIENT_LIMIT'; END IF;
    -- Periodo de implementación: límite de pacientes propio
    IF EXISTS (SELECT 1 FROM tenant t JOIN master_item s ON s.id = t.status_id
                WHERE t.id = p_tenant_id AND s.code = 'IMPLEMENTATION'
                  AND t.implementation_max_patients IS NOT NULL AND v_count >= t.implementation_max_patients) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:IMPLEMENTATION_PATIENT_LIMIT';
    END IF;
    CALL sp__next_sequence(p_tenant_id, 'PATIENT_RECORD', p_actor_id, v_seq);
    INSERT INTO patient (id, tenant_id, record_number, doc_type_id, doc_number_enc, doc_number_bidx, first_name, last_name,
                         birth_date, sex_id, phone_enc, email_enc, address_enc, insurance_company, deductible, coinsurance_pct,
                         allergies_enc, medical_history_enc, notes_enc, is_active, requires_guardian, guardian_name,
                         guardian_relationship_id, guardian_doc_type_id, guardian_doc_number_enc, guardian_phone_enc,
                         guardian_email_enc, agreement_id, agreement_member_code, created_by, updated_by)
    VALUES (p_id, p_tenant_id, IF(v_seq > 999999, CAST(v_seq AS CHAR), LPAD(v_seq, 6, '0')), p_doc_type_id, p_doc_number_enc, p_doc_number_bidx, p_first_name, p_last_name,
            p_birth_date, p_sex_id, p_phone_enc, p_email_enc, p_address_enc, p_insurance, p_deductible, p_coinsurance,
            p_allergies_enc, p_medical_history_enc, p_notes_enc, p_is_active, v_requires,
            IF(v_requires = 1, TRIM(p_guardian_name), NULL), IF(v_requires = 1, p_guardian_relationship_id, NULL),
            IF(v_requires = 1, p_guardian_doc_type_id, NULL), IF(v_requires = 1, p_guardian_doc_number_enc, NULL),
            IF(v_requires = 1, p_guardian_phone_enc, NULL), IF(v_requires = 1, p_guardian_email_enc, NULL),
            v_agreement, IF(v_agreement IS NULL, NULL, NULLIF(TRIM(p_agreement_member_code), '')),
            p_actor_id, p_actor_id);
  END IF;
  -- Datos de la ficha avanzada
  UPDATE patient
     SET mother_last_name = v_mother, mobile_enc = v_mobile, messaging_enc = v_msg, marital_status_id = v_marital,
         acquisition_source_id = v_acq, card_number = v_card, district_id = v_district, home_branch_id = v_branch,
         assigned_doctor_id = v_doctor, attention_type_id = v_attention, price_list_id = v_price_list,
         titular_patient_id = v_titular, titular_relationship_id = IF(v_titular IS NULL, NULL, v_titular_rel)
   WHERE id = p_id AND tenant_id = p_tenant_id;
  -- La bitácora no guarda datos sensibles, sólo qué cambió
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('name', CONCAT(p_first_name, ' ', p_last_name), 'requiresGuardian', v_requires), p_ip);
  COMMIT;
  SELECT id, record_number, agreement_id, updated_at FROM patient WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS sp_patient_delete $$
CREATE PROCEDURE sp_patient_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE patient SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient', p_id, 'DELETE', NULL, p_ip);
END $$

-- Acceso a ficha clínica (lectura de datos sensibles) queda registrado
DROP PROCEDURE IF EXISTS sp_patient_access_log $$
CREATE PROCEDURE sp_patient_access_log(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient', p_id, 'VIEW', NULL, p_ip);
END $$

-- ---------------- Lista de precios / servicios ----------------
DROP PROCEDURE IF EXISTS sp_service_list $$
CREATE PROCEDURE sp_service_list(IN p_tenant_id CHAR(36), IN p_search VARCHAR(100), IN p_include_inactive TINYINT)
BEGIN
  SELECT s.id, s.code, s.name, s.category_id, c.name AS category_name, s.currency_id, cur.code AS currency_code,
         cur.value AS currency_symbol, s.price, s.requires_lab, s.per_piece, s.is_active, s.updated_at
    FROM service s
    LEFT JOIN master_item c ON c.id = s.category_id
    JOIN master_item cur ON cur.id = s.currency_id
   WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL
     AND (p_include_inactive = 1 OR s.is_active = 1)
     AND (p_search IS NULL OR p_search = '' OR s.name LIKE CONCAT('%', p_search, '%') OR s.code = p_search)
   ORDER BY s.name;
END $$

DROP PROCEDURE IF EXISTS sp_service_save $$
CREATE PROCEDURE sp_service_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_code VARCHAR(20),
  IN p_name VARCHAR(200), IN p_category_id CHAR(36), IN p_currency_code VARCHAR(60), IN p_price DECIMAL(12,2),
  IN p_requires_lab TINYINT, IN p_per_piece TINYINT, IN p_is_active TINYINT)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_cur CHAR(36);
  CALL sp__master_check('SERVICE_CATEGORY', p_category_id, p_tenant_id);
  CALL sp__master_id('CURRENCY', p_currency_code, p_tenant_id, v_cur);
  IF p_price < 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PRICE'; END IF;
  IF EXISTS (SELECT 1 FROM service WHERE tenant_id = p_tenant_id AND code = p_code AND id <> p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CODE_TAKEN';
  END IF;
  SELECT tenant_id INTO v_owner FROM service WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF v_owner IS NOT NULL THEN
    UPDATE service SET code = p_code, name = p_name, category_id = p_category_id, currency_id = v_cur, price = p_price,
           requires_lab = p_requires_lab, per_piece = p_per_piece, is_active = p_is_active, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    INSERT INTO service (id, tenant_id, code, name, category_id, currency_id, price, requires_lab, per_piece, is_active, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_code, p_name, p_category_id, v_cur, p_price, p_requires_lab, p_per_piece, p_is_active, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'service', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('code', p_code, 'name', p_name, 'price', p_price), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_service_delete $$
CREATE PROCEDURE sp_service_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM service WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE service SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'service', p_id, 'DELETE', NULL, p_ip);
END $$

-- Dependientes de un paciente titular
DROP PROCEDURE IF EXISTS sp_patient_dependents $$
CREATE PROCEDURE sp_patient_dependents(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT p.id, p.record_number, p.first_name, p.last_name, p.mother_last_name, p.birth_date, rel.name AS relationship_name
    FROM patient p LEFT JOIN master_item rel ON rel.id = p.titular_relationship_id
   WHERE p.tenant_id = p_tenant_id AND p.titular_patient_id = p_patient_id AND p.deleted_at IS NULL
   ORDER BY p.birth_date;
END $$

-- Cumpleaños de los próximos p_days días (fechas locales de la clínica: p_today = hoy en su zona horaria)
-- Result sets: 1 pacientes (para ofertas comerciales), 2 personal (usuarios y doctores, para saludos o presentes)
DROP PROCEDURE IF EXISTS sp_birthdays $$
CREATE PROCEDURE sp_birthdays(IN p_tenant_id CHAR(36), IN p_today DATE, IN p_days INT)
BEGIN
  SELECT p.id, p.first_name, p.last_name, p.mother_last_name, p.birth_date, p.record_number, p.phone_enc, p.mobile_enc,
         p.messaging_enc, ag.name AS agreement_name,
         MOD(DAYOFYEAR(STR_TO_DATE(CONCAT(YEAR(p_today), DATE_FORMAT(p.birth_date, '-%m-%d')), '%Y-%m-%d')) - DAYOFYEAR(p_today) + 366, 366) AS days_until,
         TIMESTAMPDIFF(YEAR, p.birth_date, p_today) + IF(DATE_FORMAT(p.birth_date, '%m-%d') = DATE_FORMAT(p_today, '%m-%d'), 0, 1) AS turning
    FROM patient p LEFT JOIN agreement ag ON ag.id = p.agreement_id
   WHERE p.tenant_id = p_tenant_id AND p.deleted_at IS NULL AND p.is_active = 1 AND p.birth_date IS NOT NULL
  HAVING days_until <= p_days
   ORDER BY days_until, p.last_name
   LIMIT 200;

  SELECT x.kind, x.id, x.name, x.nickname, x.avatar, x.birth_date, x.role_name,
         MOD(DAYOFYEAR(STR_TO_DATE(CONCAT(YEAR(p_today), DATE_FORMAT(x.birth_date, '-%m-%d')), '%Y-%m-%d')) - DAYOFYEAR(p_today) + 366, 366) AS days_until
    FROM (
      SELECT 'USER' AS kind, u.id, u.full_name AS name, u.nickname, u.avatar, u.birth_date, r.name AS role_name
        FROM app_user u JOIN role r ON r.id = u.role_id
       WHERE u.tenant_id = p_tenant_id AND u.deleted_at IS NULL AND u.is_active = 1 AND u.birth_date IS NOT NULL
      UNION ALL
      SELECT 'DOCTOR', d.id, CONCAT(d.first_name, ' ', d.last_name), NULL, NULL, d.birth_date, 'Odontólogo'
        FROM doctor d
       WHERE d.tenant_id = p_tenant_id AND d.deleted_at IS NULL AND d.is_active = 1 AND d.birth_date IS NOT NULL
         AND (d.user_id IS NULL OR NOT EXISTS (SELECT 1 FROM app_user u2 WHERE u2.id = d.user_id AND u2.birth_date IS NOT NULL))
    ) x
  HAVING days_until <= p_days
   ORDER BY days_until, x.name;
END $$

DELIMITER ;
