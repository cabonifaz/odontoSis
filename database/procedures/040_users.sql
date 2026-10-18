-- =====================================================================
-- Usuarios y roles. p_tenant_id NULL = usuarios de plataforma (super admin)
-- El límite de usuarios activos del plan se valida aquí (no sólo en la app).
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_role_list $$
CREATE PROCEDURE sp_role_list(IN p_tenant_id CHAR(36))
BEGIN
  SELECT r.id, r.code, r.name, r.description, r.permissions, r.is_system
    FROM role r
   WHERE r.deleted_at IS NULL
     AND ((p_tenant_id IS NULL AND r.code = 'SUPER_ADMIN' AND r.tenant_id IS NULL)
       OR (p_tenant_id IS NOT NULL AND r.code <> 'SUPER_ADMIN' AND (r.tenant_id IS NULL OR r.tenant_id = p_tenant_id)))
   ORDER BY r.is_system DESC, r.name;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_usage $$
CREATE PROCEDURE sp_tenant_usage(IN p_tenant_id CHAR(36))
BEGIN
  SELECT p.name AS plan_name, COALESCE(t.max_users_override, p.max_users) AS max_users,
         (SELECT COUNT(*) FROM app_user u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND u.is_active = 1) AS active_users,
         COALESCE(t.max_branches_override, p.max_branches) AS max_branches,
         (SELECT COUNT(*) FROM branch b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL AND b.is_active = 1) AS active_branches,
         p.max_patients,
         (SELECT COUNT(*) FROM patient pa WHERE pa.tenant_id = t.id AND pa.deleted_at IS NULL) AS patients,
         p.max_storage_mb,
         (SELECT COALESCE(SUM(f.size_bytes), 0) FROM file_asset f WHERE f.tenant_id = t.id AND f.deleted_at IS NULL) AS storage_bytes,
         t.subscription_start, t.subscription_end, t.implementation_start, t.implementation_end, t.implementation_max_patients,
         (SELECT s.code FROM master_item s WHERE s.id = t.status_id) AS status_code
    FROM tenant t JOIN plan p ON p.id = t.plan_id
   WHERE t.id = p_tenant_id;
END $$

-- Valida cupo de usuarios activos (bloquea la fila del tenant para evitar carreras)
DROP PROCEDURE IF EXISTS sp__check_user_quota $$
CREATE PROCEDURE sp__check_user_quota(IN p_tenant_id CHAR(36), IN p_exclude_user_id CHAR(36))
BEGIN
  DECLARE v_max INT; DECLARE v_count INT;
  IF p_tenant_id IS NOT NULL THEN
    SELECT COALESCE(t.max_users_override, p.max_users) INTO v_max
      FROM tenant t JOIN plan p ON p.id = t.plan_id WHERE t.id = p_tenant_id FOR UPDATE;
    SELECT COUNT(*) INTO v_count FROM app_user
     WHERE tenant_id = p_tenant_id AND deleted_at IS NULL AND is_active = 1
       AND (p_exclude_user_id IS NULL OR id <> p_exclude_user_id);
    IF v_count >= v_max THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_USER_LIMIT';
    END IF;
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp__resolve_role $$
CREATE PROCEDURE sp__resolve_role(IN p_tenant_id CHAR(36), IN p_role_code VARCHAR(40), OUT p_role_id CHAR(36))
BEGIN
  SET p_role_id = NULL;
  IF p_tenant_id IS NULL THEN
    SELECT id INTO p_role_id FROM role WHERE code = 'SUPER_ADMIN' AND tenant_id IS NULL AND deleted_at IS NULL;
  ELSE
    SELECT id INTO p_role_id FROM role
     WHERE code = p_role_code AND code <> 'SUPER_ADMIN' AND deleted_at IS NULL
       AND (tenant_id IS NULL OR tenant_id = p_tenant_id)
     ORDER BY tenant_id IS NULL LIMIT 1;
  END IF;
  IF p_role_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:ROLE_NOT_FOUND'; END IF;
END $$

DROP PROCEDURE IF EXISTS sp_user_list $$
CREATE PROCEDURE sp_user_list(IN p_tenant_id CHAR(36))
BEGIN
  SELECT u.id, u.tenant_id, u.email, u.full_name, u.nickname, u.avatar, u.birth_date, u.is_active, u.must_change_password, u.totp_enabled,
         u.last_login_at, u.locked_until, r.code AS role_code, r.name AS role_name, r.permissions AS role_permissions,
         u.permission_overrides, u.created_at, u.updated_at,
         (SELECT d.id FROM doctor d WHERE d.user_id = u.id AND d.deleted_at IS NULL LIMIT 1) AS doctor_id
    FROM app_user u JOIN role r ON r.id = u.role_id
   WHERE u.deleted_at IS NULL AND u.tenant_id <=> p_tenant_id
   ORDER BY u.full_name;
END $$

DROP PROCEDURE IF EXISTS sp_user_create $$
CREATE PROCEDURE sp_user_create(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36),
  IN p_email VARCHAR(200), IN p_full_name VARCHAR(200), IN p_role_code VARCHAR(40), IN p_password_hash VARCHAR(255),
  IN p_permission_overrides JSON)
BEGIN
  DECLARE v_role CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__resolve_role(p_tenant_id, p_role_code, v_role);
  IF EXISTS (SELECT 1 FROM app_user WHERE email = LOWER(TRIM(p_email))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:EMAIL_TAKEN';
  END IF;
  START TRANSACTION;
  CALL sp__check_user_quota(p_tenant_id, NULL);
  INSERT INTO app_user (id, tenant_id, role_id, permission_overrides, email, password_hash, full_name, must_change_password, created_by, updated_by)
  VALUES (p_id, p_tenant_id, v_role, p_permission_overrides, LOWER(TRIM(p_email)), p_password_hash, p_full_name, 1, p_actor_id, p_actor_id);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'app_user', p_id, 'CREATE',
       JSON_OBJECT('email', LOWER(TRIM(p_email)), 'role', p_role_code), p_ip);
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_user_update $$
CREATE PROCEDURE sp_user_update(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36),
  IN p_full_name VARCHAR(200), IN p_role_code VARCHAR(40), IN p_is_active TINYINT, IN p_permission_overrides JSON)
BEGIN
  DECLARE v_role CHAR(36); DECLARE v_was_active TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  SELECT is_active INTO v_was_active FROM app_user WHERE id = p_id AND tenant_id <=> p_tenant_id AND deleted_at IS NULL;
  IF v_was_active IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;
  IF p_id = p_actor_id AND p_is_active = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CANNOT_DISABLE_SELF'; END IF;
  CALL sp__resolve_role(p_tenant_id, p_role_code, v_role);
  IF p_is_active = 0 OR p_role_code <> 'CLINIC_ADMIN' THEN CALL sp__check_last_admin(p_tenant_id, p_id); END IF;
  START TRANSACTION;
  IF p_is_active = 1 AND v_was_active = 0 THEN CALL sp__check_user_quota(p_tenant_id, p_id); END IF;
  UPDATE app_user SET full_name = p_full_name, role_id = v_role, is_active = p_is_active,
         permission_overrides = COALESCE(p_permission_overrides, permission_overrides), updated_by = p_actor_id
   WHERE id = p_id;
  IF p_is_active = 0 THEN CALL sp_session_revoke_user(p_id, NULL, p_actor_id); END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'app_user', p_id, 'UPDATE',
       JSON_OBJECT('role', p_role_code, 'isActive', p_is_active, 'permissionOverrides', p_permission_overrides), p_ip);
  COMMIT;
END $$

-- La clínica nunca se queda sin un administrador activo (si p_user_id es hoy el único, se rechaza)
DROP PROCEDURE IF EXISTS sp__check_last_admin $$
CREATE PROCEDURE sp__check_last_admin(IN p_tenant_id CHAR(36), IN p_user_id CHAR(36))
BEGIN
  IF p_tenant_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM app_user u JOIN role r ON r.id = u.role_id
                  WHERE u.id = p_user_id AND u.tenant_id = p_tenant_id AND u.deleted_at IS NULL AND u.is_active = 1 AND r.code = 'CLINIC_ADMIN')
     AND NOT EXISTS (SELECT 1 FROM app_user u JOIN role r ON r.id = u.role_id
                      WHERE u.tenant_id = p_tenant_id AND u.id <> p_user_id AND u.deleted_at IS NULL AND u.is_active = 1 AND r.code = 'CLINIC_ADMIN') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:LAST_ADMIN';
  END IF;
END $$

DROP PROCEDURE IF EXISTS sp_user_delete $$
CREATE PROCEDURE sp_user_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF p_id = p_actor_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CANNOT_DELETE_SELF'; END IF;
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id = p_id AND tenant_id <=> p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  CALL sp__check_last_admin(p_tenant_id, p_id);
  -- Se libera el email (se conserva el original en la bitácora)
  UPDATE app_user
     SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, is_active = 0, updated_by = p_actor_id,
         email = CONCAT('deleted+', id, '@invalid')
   WHERE id = p_id;
  UPDATE doctor SET user_id = NULL, updated_by = p_actor_id WHERE user_id = p_id;
  CALL sp_session_revoke_user(p_id, NULL, p_actor_id);
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'app_user', p_id, 'DELETE', NULL, p_ip);
END $$

-- Desbloqueo/reseteo de contraseña por un administrador
DROP PROCEDURE IF EXISTS sp_user_reset_password $$
CREATE PROCEDURE sp_user_reset_password(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_password_hash VARCHAR(255))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_user WHERE id = p_id AND tenant_id <=> p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  CALL sp_user_password_set(p_id, p_password_hash, 1, p_actor_id, p_ip);
  CALL sp_session_revoke_user(p_id, NULL, p_actor_id);
END $$

-- Perfil propio del usuario: apodo, avatar y fecha de nacimiento (para saludos de cumpleaños)
DROP PROCEDURE IF EXISTS sp_user_profile_update $$
CREATE PROCEDURE sp_user_profile_update(
  IN p_user_id CHAR(36), IN p_ip VARCHAR(64), IN p_full_name VARCHAR(200), IN p_nickname VARCHAR(40), IN p_avatar VARCHAR(40), IN p_birth_date DATE)
BEGIN
  DECLARE v_tenant CHAR(36);
  IF p_birth_date IS NOT NULL AND (p_birth_date > UTC_DATE() OR p_birth_date < '1900-01-01') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_BIRTH_DATE';
  END IF;
  UPDATE app_user SET full_name = p_full_name, nickname = NULLIF(TRIM(p_nickname), ''), avatar = NULLIF(TRIM(p_avatar), ''),
         birth_date = p_birth_date, updated_by = p_user_id
   WHERE id = p_user_id AND deleted_at IS NULL;
  SELECT tenant_id INTO v_tenant FROM app_user WHERE id = p_user_id;
  CALL sp_audit_log_add(v_tenant, p_user_id, 'app_user', p_user_id, 'PROFILE',
       JSON_OBJECT('nickname', p_nickname, 'avatar', p_avatar), p_ip);
END $$

DELIMITER ;
