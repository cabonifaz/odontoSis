-- =====================================================================
-- Convenios (acuerdos de promoción con empresas o clubes)
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_agreement_list $$
CREATE PROCEDURE sp_agreement_list(IN p_tenant_id CHAR(36), IN p_include_inactive TINYINT)
BEGIN
  SELECT a.id, a.code, a.name, a.company_name, a.discount_pct, a.valid_from, a.valid_to, a.requires_member_code,
         a.notes, a.is_active, a.updated_at,
         (SELECT COUNT(*) FROM patient p WHERE p.agreement_id = a.id AND p.deleted_at IS NULL) AS patient_count
    FROM agreement a
   WHERE a.tenant_id = p_tenant_id AND a.deleted_at IS NULL AND (p_include_inactive = 1 OR a.is_active = 1)
   ORDER BY a.name;
END $$

DROP PROCEDURE IF EXISTS sp_agreement_save $$
CREATE PROCEDURE sp_agreement_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_code VARCHAR(30),
  IN p_name VARCHAR(150), IN p_company_name VARCHAR(200), IN p_discount_pct DECIMAL(5,2), IN p_valid_from DATE,
  IN p_valid_to DATE, IN p_requires_member_code TINYINT, IN p_notes VARCHAR(500), IN p_is_active TINYINT)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL;
  IF p_discount_pct < 0 OR p_discount_pct > 100 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_DISCOUNT'; END IF;
  IF p_valid_from IS NOT NULL AND p_valid_to IS NOT NULL AND p_valid_to < p_valid_from THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PERIOD';
  END IF;
  IF EXISTS (SELECT 1 FROM agreement WHERE tenant_id = p_tenant_id AND code = p_code AND id <> p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CODE_TAKEN';
  END IF;
  SELECT tenant_id INTO v_owner FROM agreement WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF v_owner IS NOT NULL THEN
    UPDATE agreement
       SET code = p_code, name = p_name, company_name = p_company_name, discount_pct = p_discount_pct,
           valid_from = p_valid_from, valid_to = p_valid_to, requires_member_code = p_requires_member_code,
           notes = p_notes, is_active = p_is_active, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    INSERT INTO agreement (id, tenant_id, code, name, company_name, discount_pct, valid_from, valid_to, requires_member_code,
                           notes, is_active, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_code, p_name, p_company_name, p_discount_pct, p_valid_from, p_valid_to, p_requires_member_code,
            p_notes, p_is_active, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'agreement', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('code', p_code, 'name', p_name, 'discountPct', p_discount_pct, 'isActive', p_is_active), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_agreement_delete $$
CREATE PROCEDURE sp_agreement_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM agreement WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM patient WHERE agreement_id = p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:AGREEMENT_IN_USE';
  END IF;
  UPDATE agreement SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id, is_active = 0
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'agreement', p_id, 'DELETE', NULL, p_ip);
END $$

-- % y nombre del convenio aplicable a una fecha (debe ser del tenant, activo y vigente)
DROP PROCEDURE IF EXISTS sp__agreement_for_date $$
CREATE PROCEDURE sp__agreement_for_date(
  IN p_tenant_id CHAR(36), IN p_agreement_id CHAR(36), IN p_date DATE, OUT p_pct DECIMAL(5,2), OUT p_name VARCHAR(150))
BEGIN
  SET p_pct = 0; SET p_name = NULL;
  IF p_agreement_id IS NOT NULL THEN
    SELECT discount_pct, name INTO p_pct, p_name FROM agreement
     WHERE id = p_agreement_id AND tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = 1
       AND (valid_from IS NULL OR valid_from <= p_date) AND (valid_to IS NULL OR valid_to >= p_date);
    IF p_name IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:AGREEMENT_NOT_VALID'; END IF;
  END IF;
END $$

DELIMITER ;
