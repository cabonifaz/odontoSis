-- =====================================================================
-- Notificaciones (campana y contadores del menú). Cada usuario sólo ve las suyas.
-- =====================================================================
DELIMITER $$

-- Crea una notificación para un usuario (uso interno de otros SP)
DROP PROCEDURE IF EXISTS sp__notify $$
CREATE PROCEDURE sp__notify(
  IN p_tenant_id CHAR(36), IN p_user_id CHAR(36), IN p_area VARCHAR(30), IN p_kind VARCHAR(40),
  IN p_title VARCHAR(200), IN p_body VARCHAR(500), IN p_link VARCHAR(300), IN p_entity_id CHAR(36), IN p_actor_id CHAR(36))
BEGIN
  IF p_user_id IS NOT NULL AND (p_actor_id IS NULL OR p_user_id <> p_actor_id) THEN
    INSERT INTO notification (id, tenant_id, user_id, area, kind, title, body, link, entity_id, created_by, updated_by)
    VALUES (UUID(), p_tenant_id, p_user_id, p_area, p_kind, LEFT(p_title, 200), LEFT(p_body, 500), p_link, p_entity_id, p_actor_id, p_actor_id);
  END IF;
END $$

-- Notifica a todos los super admin activos
DROP PROCEDURE IF EXISTS sp__notify_platform $$
CREATE PROCEDURE sp__notify_platform(
  IN p_area VARCHAR(30), IN p_kind VARCHAR(40), IN p_title VARCHAR(200), IN p_body VARCHAR(500),
  IN p_link VARCHAR(300), IN p_entity_id CHAR(36), IN p_actor_id CHAR(36))
BEGIN
  INSERT INTO notification (id, tenant_id, user_id, area, kind, title, body, link, entity_id, created_by, updated_by)
  SELECT UUID(), NULL, u.id, p_area, p_kind, LEFT(p_title, 200), LEFT(p_body, 500), p_link, p_entity_id, p_actor_id, p_actor_id
    FROM app_user u JOIN role r ON r.id = u.role_id
   WHERE u.tenant_id IS NULL AND r.code = 'SUPER_ADMIN' AND u.is_active = 1 AND u.deleted_at IS NULL;
END $$

-- Contadores sin leer: total y por área (para la campana y los menús)
DROP PROCEDURE IF EXISTS sp_notification_summary $$
CREATE PROCEDURE sp_notification_summary(IN p_user_id CHAR(36))
BEGIN
  SELECT area, COUNT(*) AS unread
    FROM notification
   WHERE user_id = p_user_id AND read_at IS NULL AND deleted_at IS NULL
   GROUP BY area;
END $$

-- Últimas notificaciones del usuario (leídas y sin leer)
DROP PROCEDURE IF EXISTS sp_notification_list $$
CREATE PROCEDURE sp_notification_list(IN p_user_id CHAR(36), IN p_area VARCHAR(30), IN p_limit INT)
BEGIN
  SELECT id, area, kind, title, body, link, entity_id, read_at, created_at
    FROM notification
   WHERE user_id = p_user_id AND deleted_at IS NULL AND (p_area IS NULL OR area = p_area)
   ORDER BY created_at DESC
   LIMIT p_limit;
END $$

-- Marca como leídas: una (p_id), todas las de un área (p_area) o todas (ambos NULL). Sólo las del propio usuario.
DROP PROCEDURE IF EXISTS sp_notification_mark_read $$
CREATE PROCEDURE sp_notification_mark_read(IN p_user_id CHAR(36), IN p_id CHAR(36), IN p_area VARCHAR(30))
BEGIN
  UPDATE notification SET read_at = UTC_TIMESTAMP(3), updated_by = p_user_id
   WHERE user_id = p_user_id AND read_at IS NULL AND deleted_at IS NULL
     AND (p_id IS NULL OR id = p_id) AND (p_area IS NULL OR area = p_area);
END $$

DELIMITER ;
