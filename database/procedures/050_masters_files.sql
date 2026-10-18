-- =====================================================================
-- Maestro de maestros (catálogos) y archivos
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_master_table_list $$
CREATE PROCEDURE sp_master_table_list()
BEGIN
  SELECT id, code, name, description, tenant_editable FROM master_table WHERE deleted_at IS NULL ORDER BY name;
END $$

-- Ítems visibles para un tenant: globales + propios. p_table_code NULL = todos (cache offline)
DROP PROCEDURE IF EXISTS sp_master_item_list $$
CREATE PROCEDURE sp_master_item_list(IN p_tenant_id CHAR(36), IN p_table_code VARCHAR(60), IN p_include_inactive TINYINT)
BEGIN
  SELECT mi.id, mt.code AS table_code, mi.code, mi.name, mi.value, mi.sort_order, mi.is_active,
         mi.is_system, mi.tenant_id, mi.parent_id, mi.updated_at
    FROM master_item mi
    JOIN master_table mt ON mt.id = mi.master_table_id
   WHERE mi.deleted_at IS NULL
     AND (mi.tenant_id IS NULL OR mi.tenant_id <=> p_tenant_id)
     AND (p_table_code IS NULL OR mt.code = p_table_code)
     AND (p_include_inactive = 1 OR mi.is_active = 1)
   ORDER BY mt.code, mi.sort_order, mi.name;
END $$

-- Alta/edición de ítems propios del tenant (sólo en tablas tenant_editable).
-- Con p_tenant_id NULL (super admin) se editan ítems globales.
DROP PROCEDURE IF EXISTS sp_master_item_save $$
CREATE PROCEDURE sp_master_item_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36),
  IN p_table_code VARCHAR(60), IN p_code VARCHAR(60), IN p_name VARCHAR(150), IN p_value VARCHAR(255),
  IN p_sort_order INT, IN p_is_active TINYINT)
BEGIN
  DECLARE v_table CHAR(36); DECLARE v_editable TINYINT; DECLARE v_owner CHAR(36); DECLARE v_exists TINYINT DEFAULT 0;
  SELECT id, tenant_editable INTO v_table, v_editable FROM master_table WHERE code = p_table_code AND deleted_at IS NULL;
  IF v_table IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF p_tenant_id IS NOT NULL AND v_editable = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CATALOG_NOT_EDITABLE'; END IF;

  SELECT 1, tenant_id INTO v_exists, v_owner FROM master_item WHERE id = p_id;
  IF v_exists = 1 AND NOT (v_owner <=> p_tenant_id) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FORBIDDEN'; END IF;
  IF EXISTS (SELECT 1 FROM master_item WHERE master_table_id = v_table AND code = p_code AND id <> p_id
               AND deleted_at IS NULL AND (tenant_id IS NULL OR tenant_id <=> p_tenant_id)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CODE_TAKEN';
  END IF;

  IF v_exists = 1 THEN
    UPDATE master_item SET code = p_code, name = p_name, value = p_value, sort_order = p_sort_order,
           is_active = p_is_active, updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    INSERT INTO master_item (id, master_table_id, tenant_id, code, name, value, sort_order, is_system, is_active, created_by, updated_by)
    VALUES (p_id, v_table, p_tenant_id, p_code, p_name, p_value, p_sort_order, 0, p_is_active, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'master_item', p_id, IF(v_exists = 1, 'UPDATE', 'CREATE'),
       JSON_OBJECT('table', p_table_code, 'code', p_code, 'name', p_name), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_master_item_delete $$
CREATE PROCEDURE sp_master_item_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM master_item WHERE id = p_id AND tenant_id <=> p_tenant_id AND is_system = 0 AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE master_item SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id WHERE id = p_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'master_item', p_id, 'DELETE', NULL, p_ip);
END $$

-- ---------- Archivos (el binario vive en el volumen persistente UPLOAD_DIR) ----------
DROP PROCEDURE IF EXISTS sp_file_create $$
CREATE PROCEDURE sp_file_create(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_kind VARCHAR(30),
  IN p_storage_key VARCHAR(255), IN p_original_name VARCHAR(255), IN p_mime VARCHAR(100), IN p_size INT, IN p_sha256 CHAR(64))
BEGIN
  DECLARE v_max_mb INT; DECLARE v_used BIGINT;
  IF p_tenant_id IS NOT NULL THEN
    SELECT p.max_storage_mb INTO v_max_mb FROM tenant t JOIN plan p ON p.id = t.plan_id WHERE t.id = p_tenant_id;
    SELECT COALESCE(SUM(size_bytes), 0) INTO v_used FROM file_asset WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
    IF v_used + p_size > v_max_mb * 1024 * 1024 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_STORAGE_LIMIT'; END IF;
  END IF;
  INSERT INTO file_asset (id, tenant_id, kind, storage_key, original_name, mime_type, size_bytes, sha256, created_by, updated_by)
  VALUES (p_id, p_tenant_id, p_kind, p_storage_key, LEFT(p_original_name, 255), p_mime, p_size, p_sha256, p_actor_id, p_actor_id);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'file_asset', p_id, 'CREATE',
       JSON_OBJECT('kind', p_kind, 'name', LEFT(p_original_name, 255), 'size', p_size), p_ip);
END $$

-- p_tenant_id NULL = super admin (acceso a cualquier archivo)
DROP PROCEDURE IF EXISTS sp_file_get $$
CREATE PROCEDURE sp_file_get(IN p_tenant_id CHAR(36), IN p_is_platform TINYINT, IN p_id CHAR(36))
BEGIN
  SELECT id, tenant_id, kind, storage_key, original_name, mime_type, size_bytes, sha256, updated_at
    FROM file_asset
   WHERE id = p_id AND deleted_at IS NULL AND (p_is_platform = 1 OR tenant_id <=> p_tenant_id);
END $$

DELIMITER ;
