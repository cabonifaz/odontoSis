-- =====================================================================
-- Autenticación y sesiones
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_auth_user_get_by_email $$
CREATE PROCEDURE sp_auth_user_get_by_email(IN p_email VARCHAR(200))
BEGIN
  SELECT u.id, u.tenant_id, u.email, u.password_hash, u.full_name, u.is_active,
         u.must_change_password, u.failed_login_count, u.locked_until,
         u.totp_enabled, u.totp_secret_enc,
         r.code AS role_code,
         t.code AS tenant_code,
         ts.code AS tenant_status_code,
         t.deleted_at AS tenant_deleted_at
    FROM app_user u
    JOIN role r ON r.id = u.role_id
    LEFT JOIN tenant t ON t.id = u.tenant_id
    LEFT JOIN master_item ts ON ts.id = t.status_id
   WHERE u.email = LOWER(TRIM(p_email)) AND u.deleted_at IS NULL
   LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS sp_auth_login_failed $$
CREATE PROCEDURE sp_auth_login_failed(
  IN p_user_id CHAR(36), IN p_email VARCHAR(200), IN p_max_attempts INT, IN p_lock_minutes INT,
  IN p_ip VARCHAR(64), IN p_reason VARCHAR(40))
BEGIN
  DECLARE v_tenant CHAR(36) DEFAULT NULL;
  IF p_user_id IS NOT NULL THEN
    -- MySQL evalúa las asignaciones de izquierda a derecha: failed_login_count ya está incrementado
    UPDATE app_user
       SET failed_login_count = failed_login_count + 1,
           locked_until = IF(failed_login_count >= p_max_attempts,
                             UTC_TIMESTAMP(3) + INTERVAL p_lock_minutes MINUTE, locked_until),
           updated_by = id
     WHERE id = p_user_id;
    UPDATE app_user SET failed_login_count = 0 WHERE id = p_user_id AND failed_login_count >= p_max_attempts;
    SELECT tenant_id INTO v_tenant FROM app_user WHERE id = p_user_id;
  END IF;
  CALL sp_audit_log_add(v_tenant, p_user_id, 'auth', p_user_id, 'LOGIN_FAILED',
                        JSON_OBJECT('email', LOWER(TRIM(p_email)), 'reason', p_reason), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_auth_login_succeeded $$
CREATE PROCEDURE sp_auth_login_succeeded(IN p_user_id CHAR(36), IN p_ip VARCHAR(64))
BEGIN
  DECLARE v_tenant CHAR(36);
  UPDATE app_user
     SET failed_login_count = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3),
         last_login_ip = p_ip, updated_by = id
   WHERE id = p_user_id;
  SELECT tenant_id INTO v_tenant FROM app_user WHERE id = p_user_id;
  CALL sp_audit_log_add(v_tenant, p_user_id, 'auth', p_user_id, 'LOGIN', NULL, p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_session_create $$
CREATE PROCEDURE sp_session_create(
  IN p_id CHAR(36), IN p_user_id CHAR(36), IN p_token_hash CHAR(64), IN p_ip VARCHAR(64),
  IN p_user_agent VARCHAR(300), IN p_expires_at DATETIME(3), IN p_mfa_verified TINYINT)
BEGIN
  INSERT INTO user_session (id, user_id, token_hash, ip, user_agent, mfa_verified, expires_at, last_seen_at, created_by, updated_by)
  VALUES (p_id, p_user_id, p_token_hash, p_ip, LEFT(p_user_agent, 300), p_mfa_verified, p_expires_at, UTC_TIMESTAMP(3), p_user_id, p_user_id);
END $$

-- Sesión válida + usuario + permisos + branding del tenant
DROP PROCEDURE IF EXISTS sp_session_get $$
CREATE PROCEDURE sp_session_get(IN p_token_hash CHAR(64))
BEGIN
  SELECT s.id AS session_id, s.expires_at, s.last_seen_at, s.mfa_verified,
         u.id AS user_id, u.email, u.full_name, u.nickname, u.avatar, u.birth_date, u.tenant_id, u.must_change_password, u.totp_enabled,
         t.patient_form_mode,
         r.code AS role_code, r.name AS role_name, r.permissions, u.permission_overrides,
         t.trade_name AS tenant_name, t.code AS tenant_code, t.primary_color, t.secondary_color,
         t.logo_file_id, t.timezone, ts.code AS tenant_status_code,
         cur.code AS currency_code, cur.value AS currency_symbol, t.budget_validity_days,
         t.subscription_start, t.subscription_end, t.implementation_start, t.implementation_end,
         (SELECT d.id FROM doctor d WHERE d.user_id = u.id AND d.deleted_at IS NULL LIMIT 1) AS doctor_id
    FROM user_session s
    JOIN app_user u ON u.id = s.user_id AND u.deleted_at IS NULL AND u.is_active = 1
    JOIN role r ON r.id = u.role_id
    LEFT JOIN tenant t ON t.id = u.tenant_id
    LEFT JOIN master_item ts ON ts.id = t.status_id
    LEFT JOIN master_item cur ON cur.id = t.currency_id
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL AND s.deleted_at IS NULL
     AND s.expires_at > UTC_TIMESTAMP(3)
     AND s.created_at > UTC_TIMESTAMP(3) - INTERVAL 7 DAY
   LIMIT 1;
END $$

DROP PROCEDURE IF EXISTS sp_session_touch $$
CREATE PROCEDURE sp_session_touch(IN p_session_id CHAR(36), IN p_expires_at DATETIME(3))
BEGIN
  UPDATE user_session SET last_seen_at = UTC_TIMESTAMP(3), expires_at = p_expires_at, updated_by = user_id
   WHERE id = p_session_id AND revoked_at IS NULL;
END $$

DROP PROCEDURE IF EXISTS sp_session_set_mfa $$
CREATE PROCEDURE sp_session_set_mfa(IN p_session_id CHAR(36), IN p_ip VARCHAR(64))
BEGIN
  DECLARE v_user CHAR(36);
  UPDATE user_session SET mfa_verified = 1, updated_by = user_id WHERE id = p_session_id AND revoked_at IS NULL;
  SELECT user_id INTO v_user FROM user_session WHERE id = p_session_id;
  CALL sp_audit_log_add(NULL, v_user, 'auth', v_user, 'MFA_VERIFIED', NULL, p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_session_revoke $$
CREATE PROCEDURE sp_session_revoke(IN p_token_hash CHAR(64), IN p_ip VARCHAR(64))
BEGIN
  DECLARE v_user CHAR(36);
  SELECT user_id INTO v_user FROM user_session WHERE token_hash = p_token_hash;
  UPDATE user_session SET revoked_at = UTC_TIMESTAMP(3), updated_by = user_id
   WHERE token_hash = p_token_hash AND revoked_at IS NULL;
  IF v_user IS NOT NULL THEN
    CALL sp_audit_log_add(NULL, v_user, 'auth', v_user, 'LOGOUT', NULL, p_ip);
  END IF;
END $$

-- Revoca todas las sesiones de un usuario (opcionalmente excepto una)
DROP PROCEDURE IF EXISTS sp_session_revoke_user $$
CREATE PROCEDURE sp_session_revoke_user(IN p_user_id CHAR(36), IN p_except_session_id CHAR(36), IN p_actor_id CHAR(36))
BEGIN
  UPDATE user_session SET revoked_at = UTC_TIMESTAMP(3), updated_by = p_actor_id
   WHERE user_id = p_user_id AND revoked_at IS NULL
     AND (p_except_session_id IS NULL OR id <> p_except_session_id);
END $$

DROP PROCEDURE IF EXISTS sp_user_security_get $$
CREATE PROCEDURE sp_user_security_get(IN p_user_id CHAR(36))
BEGIN
  SELECT id, tenant_id, email, password_hash, totp_enabled, totp_secret_enc, totp_last_step
    FROM app_user WHERE id = p_user_id AND deleted_at IS NULL;
END $$

DROP PROCEDURE IF EXISTS sp_user_password_set $$
CREATE PROCEDURE sp_user_password_set(
  IN p_user_id CHAR(36), IN p_password_hash VARCHAR(255), IN p_must_change TINYINT,
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64))
BEGIN
  DECLARE v_tenant CHAR(36);
  UPDATE app_user
     SET password_hash = p_password_hash, must_change_password = p_must_change,
         password_changed_at = UTC_TIMESTAMP(3), failed_login_count = 0, locked_until = NULL,
         updated_by = p_actor_id
   WHERE id = p_user_id AND deleted_at IS NULL;
  SELECT tenant_id INTO v_tenant FROM app_user WHERE id = p_user_id;
  CALL sp_audit_log_add(v_tenant, p_actor_id, 'app_user', p_user_id, 'PASSWORD_CHANGED',
                        JSON_OBJECT('mustChange', p_must_change), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_user_totp_set $$
CREATE PROCEDURE sp_user_totp_set(
  IN p_user_id CHAR(36), IN p_secret_enc VARCHAR(255), IN p_enabled TINYINT, IN p_actor_id CHAR(36), IN p_ip VARCHAR(64))
BEGIN
  DECLARE v_tenant CHAR(36);
  UPDATE app_user SET totp_secret_enc = p_secret_enc, totp_enabled = p_enabled, totp_last_step = NULL, mfa_failed_count = 0,
         updated_by = p_actor_id
   WHERE id = p_user_id AND deleted_at IS NULL;
  SELECT tenant_id INTO v_tenant FROM app_user WHERE id = p_user_id;
  CALL sp_audit_log_add(v_tenant, p_actor_id, 'app_user', p_user_id, IF(p_enabled = 1, 'MFA_ENABLED', 'MFA_PENDING'), NULL, p_ip);
END $$

-- Datos públicos de una clínica para su pantalla de login (/c/<código>). Sin datos sensibles.
DROP PROCEDURE IF EXISTS sp_tenant_public_get $$
CREATE PROCEDURE sp_tenant_public_get(IN p_code VARCHAR(40))
BEGIN
  SELECT t.code, t.trade_name, t.primary_color, t.secondary_color, t.logo_file_id, ts.code AS status_code
    FROM tenant t JOIN master_item ts ON ts.id = t.status_id
   WHERE t.code = LOWER(p_code) AND t.deleted_at IS NULL;
END $$

-- Logo público de una clínica (sólo archivos LOGO vigentes de esa clínica)
DROP PROCEDURE IF EXISTS sp_tenant_public_logo $$
CREATE PROCEDURE sp_tenant_public_logo(IN p_code VARCHAR(40))
BEGIN
  SELECT f.id, f.storage_key, f.mime_type, f.sha256
    FROM tenant t JOIN file_asset f ON f.id = t.logo_file_id AND f.kind = 'LOGO' AND f.deleted_at IS NULL
   WHERE t.code = LOWER(p_code) AND t.deleted_at IS NULL;
END $$

-- ---------------- 2FA: fallos, anti-repetición y restablecimiento ----------------

-- Código válido: rechaza reutilizar un paso TOTP ya usado (o anterior) y reinicia el contador de fallos
DROP PROCEDURE IF EXISTS sp_auth_mfa_succeeded $$
CREATE PROCEDURE sp_auth_mfa_succeeded(IN p_user_id CHAR(36), IN p_step BIGINT)
BEGIN
  DECLARE v_last BIGINT;
  SELECT totp_last_step INTO v_last FROM app_user WHERE id = p_user_id AND deleted_at IS NULL FOR UPDATE;
  IF v_last IS NOT NULL AND p_step <= v_last THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_MFA';
  END IF;
  UPDATE app_user SET totp_last_step = p_step, mfa_failed_count = 0 WHERE id = p_user_id;
END $$

-- Código inválido: al llegar al máximo se bloquea la cuenta y se revocan TODAS sus sesiones.
-- Devuelve locked = 1 cuando se bloqueó.
DROP PROCEDURE IF EXISTS sp_auth_mfa_failed $$
CREATE PROCEDURE sp_auth_mfa_failed(IN p_user_id CHAR(36), IN p_max_attempts INT, IN p_lock_minutes INT, IN p_ip VARCHAR(64))
BEGIN
  DECLARE v_count INT; DECLARE v_tenant CHAR(36);
  UPDATE app_user SET mfa_failed_count = mfa_failed_count + 1 WHERE id = p_user_id AND deleted_at IS NULL;
  SELECT mfa_failed_count, tenant_id INTO v_count, v_tenant FROM app_user WHERE id = p_user_id;
  CALL sp_audit_log_add(v_tenant, p_user_id, 'auth', p_user_id, 'MFA_FAILED', JSON_OBJECT('count', v_count), p_ip);
  IF v_count >= p_max_attempts THEN
    UPDATE app_user SET mfa_failed_count = 0, locked_until = UTC_TIMESTAMP(3) + INTERVAL p_lock_minutes MINUTE WHERE id = p_user_id;
    UPDATE user_session SET revoked_at = UTC_TIMESTAMP(3), updated_by = p_user_id WHERE user_id = p_user_id AND revoked_at IS NULL;
    CALL sp_audit_log_add(v_tenant, p_user_id, 'auth', p_user_id, 'MFA_LOCKED', NULL, p_ip);
    SELECT 1 AS locked;
  ELSE
    SELECT 0 AS locked;
  END IF;
END $$

-- Restablece el 2FA de un usuario (pierde su autenticador). Lo hace el admin de su clínica (p_tenant_id)
-- o el super admin (p_tenant_id NULL). Revoca sus sesiones: deberá ingresar y volver a configurarlo.
DROP PROCEDURE IF EXISTS sp_user_totp_reset $$
CREATE PROCEDURE sp_user_totp_reset(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_user_id CHAR(36))
BEGIN
  DECLARE v_tenant CHAR(36); DECLARE v_found INT DEFAULT 0;
  SELECT COUNT(*), MAX(tenant_id) INTO v_found, v_tenant FROM app_user
   WHERE id = p_user_id AND deleted_at IS NULL AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id);
  IF v_found = 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:USER_NOT_FOUND'; END IF;
  IF p_user_id = p_actor_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CANNOT_RESET_OWN_MFA'; END IF;
  UPDATE app_user SET totp_enabled = 0, totp_secret_enc = NULL, totp_last_step = NULL, mfa_failed_count = 0, updated_by = p_actor_id
   WHERE id = p_user_id;
  UPDATE user_session SET revoked_at = UTC_TIMESTAMP(3), updated_by = p_actor_id WHERE user_id = p_user_id AND revoked_at IS NULL;
  CALL sp_audit_log_add(v_tenant, p_actor_id, 'app_user', p_user_id, 'MFA_RESET', NULL, p_ip);
END $$

DELIMITER ;
