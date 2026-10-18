-- =====================================================================
-- Tarifarios (listas de precios) por clínica o sede.
-- El precio de un servicio en un tarifario es price_list_item.price; si no está, se usa service.price.
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_price_list_list $$
CREATE PROCEDURE sp_price_list_list(IN p_tenant_id CHAR(36), IN p_include_inactive TINYINT)
BEGIN
  SELECT pl.id, pl.code, pl.name, pl.group_name, pl.branch_id, b.name AS branch_name, pl.is_default, pl.is_active, pl.updated_at,
         (SELECT COUNT(*) FROM price_list_item i WHERE i.price_list_id = pl.id AND i.deleted_at IS NULL) AS item_count,
         (SELECT COUNT(*) FROM patient p WHERE p.price_list_id = pl.id AND p.deleted_at IS NULL) AS patient_count
    FROM price_list pl LEFT JOIN branch b ON b.id = pl.branch_id
   WHERE pl.tenant_id = p_tenant_id AND pl.deleted_at IS NULL AND (p_include_inactive = 1 OR pl.is_active = 1)
   ORDER BY pl.is_default DESC, pl.group_name, pl.name;
END $$

DROP PROCEDURE IF EXISTS sp_price_list_save $$
CREATE PROCEDURE sp_price_list_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_code VARCHAR(30),
  IN p_name VARCHAR(120), IN p_group_name VARCHAR(120), IN p_branch_id CHAR(36), IN p_is_default TINYINT, IN p_is_active TINYINT)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_was_default TINYINT DEFAULT 0;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF EXISTS (SELECT 1 FROM price_list WHERE tenant_id = p_tenant_id AND code = p_code AND id <> p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CODE_TAKEN';
  END IF;
  IF p_branch_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM branch WHERE id = p_branch_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BRANCH_NOT_FOUND';
  END IF;
  SELECT tenant_id, is_default INTO v_owner, v_was_default FROM price_list WHERE id = p_id AND deleted_at IS NULL;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF v_was_default = 1 AND (p_is_default = 0 OR p_is_active = 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PRICE_LIST_DEFAULT_REQUIRED';
  END IF;
  START TRANSACTION;
  IF p_is_default = 1 THEN
    UPDATE price_list SET is_default = 0, updated_by = p_actor_id WHERE tenant_id = p_tenant_id AND id <> p_id AND is_default = 1;
  END IF;
  IF v_owner IS NOT NULL THEN
    UPDATE price_list SET code = p_code, name = p_name, group_name = p_group_name, branch_id = p_branch_id,
           is_default = p_is_default, is_active = IF(p_is_default = 1, 1, p_is_active), updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    INSERT INTO price_list (id, tenant_id, branch_id, code, name, group_name, is_default, is_active, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_branch_id, p_code, p_name, p_group_name, p_is_default, IF(p_is_default = 1, 1, p_is_active), p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'price_list', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('code', p_code, 'name', p_name, 'branchId', p_branch_id, 'isDefault', p_is_default), p_ip);
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_price_list_delete $$
CREATE PROCEDURE sp_price_list_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  DECLARE v_default TINYINT;
  SELECT is_default INTO v_default FROM price_list WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;
  IF v_default IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF v_default = 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PRICE_LIST_DEFAULT_REQUIRED'; END IF;
  IF EXISTS (SELECT 1 FROM patient WHERE price_list_id = p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PRICE_LIST_IN_USE';
  END IF;
  UPDATE price_list SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id, is_active = 0 WHERE id = p_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'price_list', p_id, 'DELETE', NULL, p_ip);
END $$

-- Precios de todos los servicios activos en un tarifario (precio propio o el base)
DROP PROCEDURE IF EXISTS sp_price_list_items $$
CREATE PROCEDURE sp_price_list_items(IN p_tenant_id CHAR(36), IN p_price_list_id CHAR(36))
BEGIN
  SELECT s.id AS service_id, s.code, s.name, s.price AS base_price, i.price AS list_price,
         COALESCE(i.price, s.price) AS effective_price, c.name AS category_name
    FROM service s
    LEFT JOIN price_list_item i ON i.service_id = s.id AND i.price_list_id = p_price_list_id AND i.deleted_at IS NULL
    LEFT JOIN master_item c ON c.id = s.category_id
   WHERE s.tenant_id = p_tenant_id AND s.deleted_at IS NULL AND s.is_active = 1
     AND EXISTS (SELECT 1 FROM price_list pl WHERE pl.id = p_price_list_id AND pl.tenant_id = p_tenant_id)
   ORDER BY s.name;
END $$

-- Define (o quita con p_price NULL) el precio de un servicio en un tarifario
DROP PROCEDURE IF EXISTS sp_price_list_item_set $$
CREATE PROCEDURE sp_price_list_item_set(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_price_list_id CHAR(36), IN p_service_id CHAR(36),
  IN p_price DECIMAL(12,2))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM price_list WHERE id = p_price_list_id AND tenant_id = p_tenant_id AND deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM service WHERE id = p_service_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  IF p_price IS NOT NULL AND p_price < 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PRICE'; END IF;
  IF p_price IS NULL THEN
    UPDATE price_list_item SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
     WHERE price_list_id = p_price_list_id AND service_id = p_service_id AND deleted_at IS NULL;
  ELSE
    INSERT INTO price_list_item (id, tenant_id, price_list_id, service_id, price, created_by, updated_by)
    VALUES (UUID(), p_tenant_id, p_price_list_id, p_service_id, p_price, p_actor_id, p_actor_id)
    ON DUPLICATE KEY UPDATE price = p_price, deleted_at = NULL, deleted_by = NULL, updated_by = p_actor_id;
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'price_list_item', p_price_list_id, 'SET_PRICE',
       JSON_OBJECT('serviceId', p_service_id, 'price', p_price), p_ip);
END $$

DELIMITER ;
