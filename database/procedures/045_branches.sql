-- =====================================================================
-- Sedes (locales) de la clínica — las habilita el super admin; límite = override de la clínica o el del plan
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_branch_list $$
CREATE PROCEDURE sp_branch_list(IN p_tenant_id CHAR(36), IN p_include_inactive TINYINT)
BEGIN
  SELECT b.id, b.code, b.name, b.address, b.phone, b.is_main, b.is_active, b.patient_form_mode, b.updated_at
    FROM branch b
   WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND (p_include_inactive = 1 OR b.is_active = 1)
   ORDER BY b.is_main DESC, b.name;
END $$

-- Valida cupo de sedes activas del plan (bloquea la fila del tenant para evitar carreras)
DROP PROCEDURE IF EXISTS sp__check_branch_quota $$
CREATE PROCEDURE sp__check_branch_quota(IN p_tenant_id CHAR(36), IN p_exclude_id CHAR(36))
BEGIN
  DECLARE v_max INT; DECLARE v_count INT;
  SELECT COALESCE(t.max_branches_override, p.max_branches) INTO v_max FROM tenant t JOIN plan p ON p.id = t.plan_id WHERE t.id = p_tenant_id FOR UPDATE;
  SELECT COUNT(*) INTO v_count FROM branch
   WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = 1 AND (p_exclude_id IS NULL OR id <> p_exclude_id);
  IF v_count >= v_max THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_BRANCH_LIMIT'; END IF;
END $$

DROP PROCEDURE IF EXISTS sp_branch_save $$
CREATE PROCEDURE sp_branch_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_code VARCHAR(20),
  IN p_name VARCHAR(120), IN p_address VARCHAR(300), IN p_phone VARCHAR(40), IN p_is_main TINYINT, IN p_is_active TINYINT,
  IN p_patient_form_mode VARCHAR(20))
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_was_active TINYINT DEFAULT 0; DECLARE v_was_main TINYINT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF EXISTS (SELECT 1 FROM branch WHERE tenant_id = p_tenant_id AND code = p_code AND id <> p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CODE_TAKEN';
  END IF;
  SELECT tenant_id, is_active, is_main INTO v_owner, v_was_active, v_was_main FROM branch WHERE id = p_id AND deleted_at IS NULL;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  -- La sede principal siempre debe existir y estar activa
  IF v_was_main = 1 AND (p_is_main = 0 OR p_is_active = 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BRANCH_MAIN_REQUIRED';
  END IF;
  IF p_is_main = 1 AND p_is_active = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BRANCH_MAIN_REQUIRED'; END IF;

  START TRANSACTION;
  IF p_is_active = 1 AND (v_owner IS NULL OR v_was_active = 0) THEN CALL sp__check_branch_quota(p_tenant_id, p_id); END IF;
  IF p_is_main = 1 THEN
    UPDATE branch SET is_main = 0, updated_by = p_actor_id WHERE tenant_id = p_tenant_id AND id <> p_id AND is_main = 1;
  END IF;
  IF v_owner IS NOT NULL THEN
    UPDATE branch SET code = p_code, name = p_name, address = p_address, phone = p_phone, is_main = p_is_main,
           is_active = p_is_active, patient_form_mode = IF(p_patient_form_mode IN ('STANDARD', 'ADVANCED'), p_patient_form_mode, NULL),
           updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    INSERT INTO branch (id, tenant_id, code, name, address, phone, is_main, is_active, patient_form_mode, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_code, p_name, p_address, p_phone, p_is_main, p_is_active,
            IF(p_patient_form_mode IN ('STANDARD', 'ADVANCED'), p_patient_form_mode, NULL), p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'branch', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('code', p_code, 'name', p_name, 'isMain', p_is_main, 'isActive', p_is_active), p_ip);
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_branch_delete $$
CREATE PROCEDURE sp_branch_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  DECLARE v_main TINYINT;
  SELECT is_main INTO v_main FROM branch WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF v_main IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF v_main = 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BRANCH_MAIN_REQUIRED'; END IF;
  UPDATE branch SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id, is_active = 0 WHERE id = p_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'branch', p_id, 'DELETE', NULL, p_ip);
END $$

-- Sede a usar: la indicada (activa y de la clínica) o la principal si viene NULL
DROP PROCEDURE IF EXISTS sp__branch_resolve $$
CREATE PROCEDURE sp__branch_resolve(IN p_tenant_id CHAR(36), IN p_branch_id CHAR(36), OUT p_out CHAR(36))
BEGIN
  SET p_out = NULL;
  IF p_branch_id IS NULL THEN
    SELECT id INTO p_out FROM branch WHERE tenant_id = p_tenant_id AND is_main = 1 AND deleted_at IS NULL LIMIT 1;
  ELSE
    SELECT id INTO p_out FROM branch WHERE id = p_branch_id AND tenant_id = p_tenant_id AND is_active = 1 AND deleted_at IS NULL;
  END IF;
  IF p_out IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BRANCH_NOT_FOUND'; END IF;
END $$

DELIMITER ;
