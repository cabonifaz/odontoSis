-- =====================================================================
-- Consentimientos del paciente (datos personales y confidencialidad clínica)
-- Estado del paciente: OK (todos vigentes) | PARTIAL | MISSING (ver sp__consent_status)
-- =====================================================================
DELIMITER $$

-- Lista de consentimientos del paciente (vigentes primero, luego historial) + datos de la clínica para el formato
DROP PROCEDURE IF EXISTS sp_patient_consent_list $$
CREATE PROCEDURE sp_patient_consent_list(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  SELECT c.id, t.code AS type_code, t.name AS type_name, c.form_version, c.signer_type, c.signer_name,
         dt.code AS signer_doc_type_code, c.signer_doc_number_enc, rel.name AS signer_relationship_name,
         c.signed_on, c.marketing_opt_in, c.file_id, fa.mime_type AS file_mime, fa.original_name AS file_name,
         c.status, c.revoked_on, c.revoke_reason, c.notes, c.created_at, u.full_name AS created_by_name
    FROM patient_consent c
    JOIN master_item t ON t.id = c.type_id
    LEFT JOIN master_item dt ON dt.id = c.signer_doc_type_id
    LEFT JOIN master_item rel ON rel.id = c.signer_relationship_id
    LEFT JOIN file_asset fa ON fa.id = c.file_id AND fa.deleted_at IS NULL
    LEFT JOIN app_user u ON u.id = c.created_by
   WHERE c.tenant_id = p_tenant_id AND c.patient_id = p_patient_id AND c.deleted_at IS NULL
   ORDER BY c.status = 'ACTIVE' DESC, c.signed_on DESC, c.created_at DESC;

  SELECT t.trade_name, t.legal_name, t.tax_id, t.address, t.phone, t.email, t.logo_file_id, s.code AS status_code
    FROM tenant t LEFT JOIN master_item s ON s.id = t.status_id WHERE t.id = p_tenant_id;
END $$

-- Registra un consentimiento firmado (uno por tipo). El vigente anterior del mismo tipo queda como REPLACED.
DROP PROCEDURE IF EXISTS sp_patient_consent_save $$
CREATE PROCEDURE sp_patient_consent_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_patient_id CHAR(36),
  IN p_type_code VARCHAR(40), IN p_form_version VARCHAR(20), IN p_signer_type VARCHAR(10), IN p_signer_name VARCHAR(200),
  IN p_signer_doc_type_id CHAR(36), IN p_signer_doc_number_enc VARCHAR(255), IN p_signer_relationship_id CHAR(36),
  IN p_signed_on DATE, IN p_marketing_opt_in TINYINT, IN p_file_id CHAR(36), IN p_notes VARCHAR(500))
BEGIN
  DECLARE v_type CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
  CALL sp__master_id('CONSENT_TYPE', p_type_code, NULL, v_type);
  IF p_signer_type NOT IN ('PATIENT', 'GUARDIAN') OR COALESCE(TRIM(p_signer_name), '') = '' OR p_signed_on IS NULL
     OR p_signed_on > UTC_DATE() + INTERVAL 1 DAY THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION';
  END IF;
  -- Catálogos del firmante (tipo de documento y parentesco) deben existir y estar al alcance de la clínica
  IF p_signer_doc_type_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
       WHERE mi.id = p_signer_doc_type_id AND mt.code = 'DOC_TYPE' AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE';
  END IF;
  IF p_signer_relationship_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
       WHERE mi.id = p_signer_relationship_id AND mt.code = 'GUARDIAN_RELATIONSHIP' AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE';
  END IF;
  -- El formato firmado debe ser un archivo de consentimiento de esta clínica
  IF p_file_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM file_asset WHERE id = p_file_id AND tenant_id = p_tenant_id AND kind = 'CONSENT' AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_ATTACHMENT';
  END IF;

  START TRANSACTION;
  UPDATE patient_consent SET status = 'REPLACED', updated_by = p_actor_id
   WHERE tenant_id = p_tenant_id AND patient_id = p_patient_id AND type_id = v_type AND status = 'ACTIVE' AND deleted_at IS NULL;
  INSERT INTO patient_consent (id, tenant_id, patient_id, type_id, form_version, signer_type, signer_name, signer_doc_type_id,
                               signer_doc_number_enc, signer_relationship_id, signed_on, marketing_opt_in, file_id, notes, created_by, updated_by)
  VALUES (p_id, p_tenant_id, p_patient_id, v_type, p_form_version, p_signer_type, TRIM(p_signer_name), p_signer_doc_type_id,
          p_signer_doc_number_enc, p_signer_relationship_id, p_signed_on,
          IF(p_type_code = 'DATA_PROTECTION', COALESCE(p_marketing_opt_in, 0), NULL), p_file_id, p_notes, p_actor_id, p_actor_id);
  -- Para que la sincronización lleve el nuevo estado a los equipos
  UPDATE patient SET updated_at = UTC_TIMESTAMP(3), updated_by = p_actor_id WHERE id = p_patient_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient_consent', p_id, 'CREATE',
       JSON_OBJECT('patientId', p_patient_id, 'type', p_type_code, 'signer', p_signer_type, 'version', p_form_version, 'file', p_file_id IS NOT NULL), p_ip);
  COMMIT;
END $$

-- Revocación (derecho del titular): queda registrada con fecha y motivo; no se borra
DROP PROCEDURE IF EXISTS sp_patient_consent_revoke $$
CREATE PROCEDURE sp_patient_consent_revoke(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_revoked_on DATE, IN p_reason VARCHAR(500))
BEGIN
  DECLARE v_patient CHAR(36);
  SELECT patient_id INTO v_patient FROM patient_consent
   WHERE id = p_id AND tenant_id = p_tenant_id AND status = 'ACTIVE' AND deleted_at IS NULL;
  IF v_patient IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF COALESCE(TRIM(p_reason), '') = '' OR p_revoked_on IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION'; END IF;
  UPDATE patient_consent SET status = 'REVOKED', revoked_on = p_revoked_on, revoke_reason = TRIM(p_reason), updated_by = p_actor_id WHERE id = p_id;
  UPDATE patient SET updated_at = UTC_TIMESTAMP(3), updated_by = p_actor_id WHERE id = v_patient;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient_consent', p_id, 'REVOKE', JSON_OBJECT('patientId', v_patient), p_ip);
END $$

DELIMITER ;
