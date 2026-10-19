-- =====================================================================
-- Contratos de suscripción y solicitudes de mejora
-- El inicio/fin oficial de la suscripción (tenant.subscription_start/end) se deriva de los contratos.
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp__tenant_recompute_subscription $$
CREATE PROCEDURE sp__tenant_recompute_subscription(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36))
BEGIN
  DECLARE v_start DATE; DECLARE v_end DATE;
  SELECT MIN(start_date), MAX(end_date) INTO v_start, v_end
    FROM tenant_contract WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;
  UPDATE tenant SET subscription_start = v_start, subscription_end = v_end, updated_by = p_actor_id WHERE id = p_tenant_id;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_contract_list $$
CREATE PROCEDURE sp_tenant_contract_list(IN p_tenant_id CHAR(36))
BEGIN
  SELECT c.id, c.tenant_id, c.contract_number, c.start_date, c.end_date, c.signed_at, c.notes, c.file_id,
         f.original_name AS file_name, f.mime_type AS file_mime, c.created_at,
         (UTC_DATE() BETWEEN c.start_date AND c.end_date) AS is_current
    FROM tenant_contract c JOIN file_asset f ON f.id = c.file_id
   WHERE c.tenant_id = p_tenant_id AND c.deleted_at IS NULL
   ORDER BY c.start_date DESC;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_contract_save $$
CREATE PROCEDURE sp_tenant_contract_save(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_tenant_id CHAR(36), IN p_number VARCHAR(40),
  IN p_start DATE, IN p_end DATE, IN p_file_id CHAR(36), IN p_signed_at DATE, IN p_notes VARCHAR(500))
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF p_end < p_start THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PERIOD'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenant WHERE id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  IF p_file_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM file_asset WHERE id = p_file_id AND tenant_id IS NULL AND kind = 'CONTRACT' AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CONTRACT_FILE_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant_contract WHERE tenant_id = p_tenant_id AND id <> p_id AND deleted_at IS NULL
               AND start_date <= p_end AND end_date >= p_start) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CONTRACT_OVERLAP';
  END IF;
  SELECT tenant_id INTO v_owner FROM tenant_contract WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;

  START TRANSACTION;
  IF v_owner IS NOT NULL THEN
    UPDATE tenant_contract
       SET contract_number = p_number, start_date = p_start, end_date = p_end, file_id = p_file_id,
           signed_at = p_signed_at, notes = p_notes, updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    INSERT INTO tenant_contract (id, tenant_id, contract_number, start_date, end_date, file_id, signed_at, notes, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_number, p_start, p_end, p_file_id, p_signed_at, p_notes, p_actor_id, p_actor_id);
  END IF;
  CALL sp__tenant_recompute_subscription(p_tenant_id, p_actor_id);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'tenant_contract', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('number', p_number, 'start', p_start, 'end', p_end, 'fileId', p_file_id), p_ip);
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_contract_delete $$
CREATE PROCEDURE sp_tenant_contract_delete(IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_tenant_id CHAR(36), IN p_id CHAR(36))
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF NOT EXISTS (SELECT 1 FROM tenant_contract WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  START TRANSACTION;
  UPDATE tenant_contract SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id WHERE id = p_id;
  CALL sp__tenant_recompute_subscription(p_tenant_id, p_actor_id);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'tenant_contract', p_id, 'DELETE', NULL, p_ip);
  COMMIT;
END $$

-- ---------------- Solicitudes (mejoras / errores / consultas) ----------------
-- p_tenant_id NULL = todas (super admin)
DROP PROCEDURE IF EXISTS sp_tenant_request_list $$
CREATE PROCEDURE sp_tenant_request_list(IN p_tenant_id CHAR(36), IN p_status_code VARCHAR(60))
BEGIN
  SELECT r.id, r.tenant_id, t.trade_name AS tenant_name, ty.code AS type_code, ty.name AS type_name, ty.value AS type_color,
         st.code AS status_code, st.name AS status_name, st.value AS status_color, r.title, r.description, r.response,
         r.created_at, r.updated_at, u.full_name AS created_by_name,
         (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', fa.id, 'name', fa.original_name, 'mime', fa.mime_type))
            FROM (SELECT a.file_id, a.sort_order FROM tenant_request_attachment a
                   WHERE a.request_id = r.id AND a.deleted_at IS NULL ORDER BY a.sort_order) x
            JOIN file_asset fa ON fa.id = x.file_id AND fa.deleted_at IS NULL) AS attachments
    FROM tenant_request r
    JOIN tenant t ON t.id = r.tenant_id
    JOIN master_item ty ON ty.id = r.type_id
    JOIN master_item st ON st.id = r.status_id
    LEFT JOIN app_user u ON u.id = r.created_by
   WHERE r.deleted_at IS NULL AND (p_tenant_id IS NULL OR r.tenant_id = p_tenant_id)
     AND (p_status_code IS NULL OR p_status_code = '' OR st.code = p_status_code)
   ORDER BY r.created_at DESC
   LIMIT 500;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_request_create $$
CREATE PROCEDURE sp_tenant_request_create(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_type_code VARCHAR(60),
  IN p_title VARCHAR(200), IN p_description TEXT, IN p_file_ids JSON)
BEGIN
  DECLARE v_type CHAR(36); DECLARE v_status CHAR(36);
  DECLARE v_n, v_ok INT DEFAULT 0;
  CALL sp__master_id('REQUEST_TYPE', p_type_code, NULL, v_type);
  CALL sp__master_id('REQUEST_STATUS', 'OPEN', NULL, v_status);
  -- Capturas adjuntas: hasta 5, de la misma clínica, subidas por el mismo usuario y sin vincular a otra solicitud
  SET v_n = COALESCE(JSON_LENGTH(p_file_ids), 0);
  IF v_n > 5 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:TOO_MANY_ATTACHMENTS'; END IF;
  IF v_n > 0 THEN
    SELECT COUNT(DISTINCT fa.id) INTO v_ok
      FROM JSON_TABLE(p_file_ids, '$[*]' COLUMNS (ord FOR ORDINALITY, fid CHAR(36) PATH '$')) j
      JOIN file_asset fa ON fa.id = j.fid COLLATE utf8mb4_0900_ai_ci
     WHERE fa.tenant_id = p_tenant_id AND fa.kind = 'REQUEST_ATTACHMENT' AND fa.created_by = p_actor_id AND fa.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM tenant_request_attachment a WHERE a.file_id = fa.id);
    IF v_ok <> v_n THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_ATTACHMENT'; END IF;
  END IF;

  INSERT INTO tenant_request (id, tenant_id, type_id, status_id, title, description, created_by, updated_by)
  VALUES (p_id, p_tenant_id, v_type, v_status, p_title, p_description, p_actor_id, p_actor_id);
  IF v_n > 0 THEN
    INSERT INTO tenant_request_attachment (id, tenant_id, request_id, file_id, sort_order, created_by, updated_by)
    SELECT UUID(), p_tenant_id, p_id, j.fid, j.ord, p_actor_id, p_actor_id
      FROM JSON_TABLE(p_file_ids, '$[*]' COLUMNS (ord FOR ORDINALITY, fid CHAR(36) PATH '$')) j;
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'tenant_request', p_id, 'CREATE', JSON_OBJECT('type', p_type_code, 'title', p_title, 'attachments', v_n), p_ip);
  -- Aviso a la plataforma
  CALL sp__notify_platform('requests', 'REQUEST_CREATED',
       CONCAT('Nueva solicitud de ', (SELECT trade_name FROM tenant WHERE id = p_tenant_id)),
       p_title, CONCAT('/admin/requests?open=', p_id), p_id, p_actor_id);
END $$

-- Atención de la solicitud por la plataforma
DROP PROCEDURE IF EXISTS sp_tenant_request_update $$
CREATE PROCEDURE sp_tenant_request_update(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_status_code VARCHAR(60), IN p_response TEXT)
BEGIN
  DECLARE v_status, v_old_status, v_tenant, v_creator CHAR(36);
  DECLARE v_old_response TEXT; DECLARE v_title VARCHAR(200);
  CALL sp__master_id('REQUEST_STATUS', p_status_code, NULL, v_status);
  SELECT tenant_id, status_id, response, created_by, title INTO v_tenant, v_old_status, v_old_response, v_creator, v_title
    FROM tenant_request WHERE id = p_id AND deleted_at IS NULL;
  IF v_tenant IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  UPDATE tenant_request SET status_id = v_status, response = p_response, updated_by = p_actor_id WHERE id = p_id;
  CALL sp_audit_log_add(v_tenant, p_actor_id, 'tenant_request', p_id, 'UPDATE', JSON_OBJECT('status', p_status_code), p_ip);
  -- Aviso a quien la creó (si cambió el estado o la respuesta)
  IF NOT (v_old_status <=> v_status) OR NOT (COALESCE(v_old_response, '') <=> COALESCE(p_response, '')) THEN
    CALL sp__notify(v_tenant, v_creator, 'requests', 'REQUEST_UPDATED',
         CASE WHEN v_old_status <=> v_status THEN 'Nueva respuesta a tu solicitud'
              WHEN p_status_code = 'DONE' THEN 'Tu solicitud fue atendida'
              WHEN p_status_code = 'IN_PROGRESS' THEN 'Tu solicitud está en proceso'
              WHEN p_status_code = 'REJECTED' THEN 'Tu solicitud fue descartada'
              ELSE 'Tu solicitud fue reabierta' END,
         CONCAT('«', v_title, '»', IF(COALESCE(p_response, '') = '', '', CONCAT(': ', LEFT(p_response, 300)))),
         CONCAT('/app/requests?highlight=', p_id), p_id, p_actor_id);
  END IF;
END $$

-- ---------------- Ampliación del periodo de implementación ----------------
DROP PROCEDURE IF EXISTS sp_tenant_implementation_extend $$
CREATE PROCEDURE sp_tenant_implementation_extend(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_tenant_id CHAR(36), IN p_new_end DATE, IN p_reason VARCHAR(500))
BEGIN
  DECLARE v_end DATE; DECLARE v_status VARCHAR(60);
  SELECT t.implementation_end, s.code INTO v_end, v_status
    FROM tenant t JOIN master_item s ON s.id = t.status_id WHERE t.id = p_tenant_id AND t.deleted_at IS NULL;
  IF v_status IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF v_status <> 'IMPLEMENTATION' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_IN_IMPLEMENTATION'; END IF;
  IF p_new_end IS NULL OR (v_end IS NOT NULL AND p_new_end <= v_end) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:EXTENSION_DATE_INVALID';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:EXTENSION_REASON_REQUIRED'; END IF;
  UPDATE tenant SET implementation_end = p_new_end, updated_by = p_actor_id WHERE id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'tenant', p_tenant_id, 'IMPLEMENTATION_EXTENDED',
       JSON_OBJECT('previousEnd', v_end, 'newEnd', p_new_end, 'reason', TRIM(p_reason)), p_ip);
END $$

-- Historial de ampliaciones (desde la bitácora de auditoría)
DROP PROCEDURE IF EXISTS sp_tenant_implementation_history $$
CREATE PROCEDURE sp_tenant_implementation_history(IN p_tenant_id CHAR(36))
BEGIN
  SELECT a.id, a.created_at, u.full_name AS actor_name,
         JSON_UNQUOTE(JSON_EXTRACT(a.detail, '$.previousEnd')) AS previous_end,
         JSON_UNQUOTE(JSON_EXTRACT(a.detail, '$.newEnd')) AS new_end,
         JSON_UNQUOTE(JSON_EXTRACT(a.detail, '$.reason')) AS reason
    FROM audit_log a LEFT JOIN app_user u ON u.id = a.user_id
   WHERE a.tenant_id = p_tenant_id AND a.entity = 'tenant' AND a.action = 'IMPLEMENTATION_EXTENDED' AND a.deleted_at IS NULL
   ORDER BY a.created_at DESC;
END $$

DELIMITER ;
