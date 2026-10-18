-- =====================================================================
-- Imágenes y archivos del paciente
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_patient_file_list $$
CREATE PROCEDURE sp_patient_file_list(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT pf.id, pf.patient_id, pf.file_id, pf.type_id, mi.code AS type_code, mi.name AS type_name,
         pf.title, pf.description, pf.taken_at, pf.tooth_code,
         fa.original_name, fa.mime_type, fa.size_bytes,
         pf.created_at, pf.created_by, u.full_name AS created_by_name, pf.updated_at
    FROM patient_file pf
    JOIN file_asset fa  ON fa.id = pf.file_id AND fa.tenant_id = pf.tenant_id AND fa.deleted_at IS NULL
    JOIN master_item mi ON mi.id = pf.type_id
    LEFT JOIN app_user u ON u.id = pf.created_by
   WHERE pf.tenant_id = p_tenant_id AND pf.patient_id = p_patient_id AND pf.deleted_at IS NULL
   ORDER BY COALESCE(pf.taken_at, DATE(pf.created_at)) DESC, pf.created_at DESC;
END $$

-- Alta/edición. En edición no se cambia el archivo ni el paciente (p_file_id debe coincidir).
DROP PROCEDURE IF EXISTS sp_patient_file_save $$
CREATE PROCEDURE sp_patient_file_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36),
  IN p_patient_id CHAR(36), IN p_file_id CHAR(36), IN p_type_id CHAR(36), IN p_title VARCHAR(150),
  IN p_description VARCHAR(500), IN p_taken_at DATE, IN p_tooth_code VARCHAR(4))
BEGIN
  DECLARE v_exists TINYINT DEFAULT 0; DECLARE v_owner CHAR(36) DEFAULT NULL;
  DECLARE v_patient CHAR(36) DEFAULT NULL; DECLARE v_file CHAR(36) DEFAULT NULL;

  IF p_type_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE'; END IF;
  CALL sp__master_check('PATIENT_FILE_TYPE', p_type_id, p_tenant_id);
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM file_asset WHERE id = p_file_id AND tenant_id = p_tenant_id
                   AND kind = 'PATIENT_FILE' AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FILE_NOT_FOUND';
  END IF;

  SELECT 1, tenant_id, patient_id, file_id INTO v_exists, v_owner, v_patient, v_file
    FROM patient_file WHERE id = p_id AND deleted_at IS NULL;
  IF v_exists = 1 AND (v_owner <> p_tenant_id OR v_patient <> p_patient_id OR v_file <> p_file_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FORBIDDEN';
  END IF;
  -- Un archivo sólo puede vincularse a un registro
  IF v_exists = 0 AND EXISTS (SELECT 1 FROM patient_file WHERE file_id = p_file_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FORBIDDEN';
  END IF;

  IF v_exists = 1 THEN
    UPDATE patient_file SET type_id = p_type_id, title = p_title, description = p_description,
           taken_at = p_taken_at, tooth_code = p_tooth_code, updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    INSERT INTO patient_file (id, tenant_id, patient_id, file_id, type_id, title, description, taken_at, tooth_code, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_patient_id, p_file_id, p_type_id, p_title, p_description, p_taken_at, p_tooth_code, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient_file', p_id, IF(v_exists = 1, 'UPDATE', 'CREATE'),
       JSON_OBJECT('patient_id', p_patient_id, 'file_id', p_file_id, 'type_id', p_type_id, 'title', p_title, 'tooth', p_tooth_code), p_ip);
  SELECT p_id AS id;
END $$

-- Baja lógica del registro y de su archivo (libera cuota de almacenamiento)
DROP PROCEDURE IF EXISTS sp_patient_file_delete $$
CREATE PROCEDURE sp_patient_file_delete(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_patient_id CHAR(36), IN p_id CHAR(36))
BEGIN
  DECLARE v_file CHAR(36) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  SELECT file_id INTO v_file FROM patient_file
   WHERE id = p_id AND tenant_id = p_tenant_id AND patient_id = p_patient_id AND deleted_at IS NULL;
  IF v_file IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;

  START TRANSACTION;
  UPDATE patient_file SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id WHERE id = p_id;
  UPDATE file_asset SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = v_file AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'patient_file', p_id, 'DELETE', JSON_OBJECT('patient_id', p_patient_id, 'file_id', v_file), p_ip);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'file_asset', v_file, 'DELETE', JSON_OBJECT('kind', 'PATIENT_FILE'), p_ip);
  COMMIT;
END $$

DELIMITER ;

-- Descarta un archivo subido que no llegó a vincularse (falló el registro de su metadata)
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_patient_file_asset_discard $$
CREATE PROCEDURE sp_patient_file_asset_discard(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_file_id CHAR(36))
BEGIN
  UPDATE file_asset SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_file_id AND tenant_id = p_tenant_id AND kind = 'PATIENT_FILE' AND deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM patient_file pf WHERE pf.file_id = p_file_id AND pf.deleted_at IS NULL);
  IF ROW_COUNT() > 0 THEN
    CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'file_asset', p_file_id, 'DELETE', JSON_OBJECT('kind', 'PATIENT_FILE', 'reason', 'discard'), p_ip);
  END IF;
END $$
DELIMITER ;
