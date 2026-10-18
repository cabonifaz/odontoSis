-- =====================================================================
-- Procedimientos comunes: auditoría y resolución de maestros
-- Errores de negocio: SIGNAL SQLSTATE '45000' con MESSAGE_TEXT 'APP:<CODIGO>'
-- =====================================================================
DELIMITER $$

-- Se invoca al abrir cada conexión del pool: toda fecha se maneja en UTC
DROP PROCEDURE IF EXISTS sp_connection_init $$
CREATE PROCEDURE sp_connection_init()
BEGIN
  SET time_zone = '+00:00';
END $$

DROP PROCEDURE IF EXISTS sp_audit_log_add $$
CREATE PROCEDURE sp_audit_log_add(
  IN p_tenant_id CHAR(36), IN p_user_id CHAR(36), IN p_entity VARCHAR(60), IN p_entity_id VARCHAR(64),
  IN p_action VARCHAR(40), IN p_detail JSON, IN p_ip VARCHAR(64))
BEGIN
  INSERT INTO audit_log (tenant_id, user_id, entity, entity_id, action, detail, ip, created_by, updated_by)
  VALUES (p_tenant_id, p_user_id, p_entity, p_entity_id, p_action, p_detail, p_ip, p_user_id, p_user_id);
END $$

-- Devuelve el id de un master_item por códigos (global o del tenant)
DROP PROCEDURE IF EXISTS sp__master_id $$
CREATE PROCEDURE sp__master_id(
  IN p_table_code VARCHAR(60), IN p_item_code VARCHAR(60), IN p_tenant_id CHAR(36), OUT p_id CHAR(36))
BEGIN
  SET p_id = NULL;
  SELECT mi.id INTO p_id
    FROM master_item mi
    JOIN master_table mt ON mt.id = mi.master_table_id
   WHERE mt.code = p_table_code AND mi.code = p_item_code
     AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id)
     AND mi.deleted_at IS NULL
   ORDER BY mi.tenant_id IS NULL
   LIMIT 1;
  IF p_id IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:MASTER_ITEM_NOT_FOUND';
  END IF;
END $$

-- Valida que un master_item pertenezca a la tabla indicada y sea visible para el tenant
DROP PROCEDURE IF EXISTS sp__master_check $$
CREATE PROCEDURE sp__master_check(IN p_table_code VARCHAR(60), IN p_item_id CHAR(36), IN p_tenant_id CHAR(36))
BEGIN
  IF p_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
       WHERE mi.id = p_item_id AND mt.code = p_table_code AND mi.deleted_at IS NULL
         AND (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE';
  END IF;
END $$

-- Siguiente correlativo por tenant (atómico)
DROP PROCEDURE IF EXISTS sp__next_sequence $$
CREATE PROCEDURE sp__next_sequence(IN p_tenant_id CHAR(36), IN p_code VARCHAR(40), IN p_actor_id CHAR(36), OUT p_value INT)
BEGIN
  INSERT IGNORE INTO tenant_sequence (tenant_id, seq_code, current_value, created_by, updated_by)
  VALUES (p_tenant_id, p_code, 0, p_actor_id, p_actor_id);
  UPDATE tenant_sequence SET current_value = LAST_INSERT_ID(current_value + 1), updated_by = p_actor_id
   WHERE tenant_id = p_tenant_id AND seq_code = p_code;
  SET p_value = LAST_INSERT_ID();
END $$

DELIMITER ;
