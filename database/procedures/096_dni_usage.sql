-- =====================================================================
-- Consumo de la consulta de DNI (cupo mensual del proveedor) y parámetros de plataforma
-- El ciclo se calcula en hora de Lima (UTC-5): va del día DNI_CYCLE_DAY 00:00
-- hasta el mismo día del mes siguiente.
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp__setting_int $$
CREATE PROCEDURE sp__setting_int(IN p_code VARCHAR(60), IN p_default INT, OUT p_value INT)
BEGIN
  SELECT CAST(value AS SIGNED) INTO p_value FROM platform_setting
   WHERE code = p_code COLLATE utf8mb4_0900_ai_ci AND deleted_at IS NULL LIMIT 1;
  SET p_value = COALESCE(p_value, p_default);
END $$

-- Inicio y fin (UTC) del ciclo de facturación vigente, desplazado p_offset ciclos (0 = actual, -1 = anterior…)
DROP PROCEDURE IF EXISTS sp__dni_cycle $$
CREATE PROCEDURE sp__dni_cycle(IN p_offset INT, OUT p_start DATETIME, OUT p_end DATETIME)
BEGIN
  DECLARE v_day INT;
  DECLARE v_local DATETIME DEFAULT UTC_TIMESTAMP() - INTERVAL 5 HOUR;
  DECLARE v_start_local DATE;
  CALL sp__setting_int('DNI_CYCLE_DAY', 1, v_day);
  SET v_day = LEAST(GREATEST(v_day, 1), 28);
  SET v_start_local = DATE_FORMAT(v_local, CONCAT('%Y-%m-', LPAD(v_day, 2, '0')));
  IF DAY(v_local) < v_day THEN SET v_start_local = v_start_local - INTERVAL 1 MONTH; END IF;
  SET v_start_local = v_start_local + INTERVAL p_offset MONTH;
  SET p_start = TIMESTAMP(v_start_local) + INTERVAL 5 HOUR;
  SET p_end   = TIMESTAMP(v_start_local + INTERVAL 1 MONTH) + INTERVAL 5 HOUR;
END $$

-- Estado del cupo en el ciclo actual (se consulta antes de llamar al proveedor)
DROP PROCEDURE IF EXISTS sp_dni_quota_status $$
CREATE PROCEDURE sp_dni_quota_status()
BEGIN
  DECLARE v_start, v_end DATETIME;
  DECLARE v_quota, v_alert INT;
  CALL sp__dni_cycle(0, v_start, v_end);
  CALL sp__setting_int('DNI_MONTHLY_QUOTA', 100, v_quota);
  CALL sp__setting_int('DNI_ALERT_PCT', 80, v_alert);
  SELECT (SELECT COUNT(*) FROM dni_lookup WHERE billable = 1 AND deleted_at IS NULL
            AND created_at >= v_start AND created_at < v_end) AS used,
         v_quota AS quota, v_alert AS alert_pct, v_start AS cycle_start, v_end AS cycle_end;
END $$

DROP PROCEDURE IF EXISTS sp_dni_lookup_add $$
CREATE PROCEDURE sp_dni_lookup_add(
  IN p_id CHAR(36), IN p_tenant_id CHAR(36), IN p_user_id CHAR(36), IN p_dni_bidx CHAR(64),
  IN p_outcome VARCHAR(20), IN p_billable TINYINT, IN p_http_status SMALLINT)
BEGIN
  IF p_outcome NOT IN ('FOUND', 'NOT_FOUND', 'ERROR', 'QUOTA') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION';
  END IF;
  INSERT INTO dni_lookup (id, tenant_id, user_id, dni_bidx, outcome, billable, http_status, created_by, updated_by)
  VALUES (p_id, p_tenant_id, p_user_id, p_dni_bidx, p_outcome, p_billable, p_http_status, p_user_id, p_user_id);
END $$

-- Panel del super admin: resumen del ciclo, consumo por clínica, por día y últimos 6 ciclos
DROP PROCEDURE IF EXISTS sp_dni_usage_summary $$
CREATE PROCEDURE sp_dni_usage_summary()
BEGIN
  DECLARE v_start, v_end, v_s, v_e DATETIME;
  DECLARE v_quota, v_alert, v_day, i INT;
  CALL sp__dni_cycle(0, v_start, v_end);
  CALL sp__setting_int('DNI_MONTHLY_QUOTA', 100, v_quota);
  CALL sp__setting_int('DNI_ALERT_PCT', 80, v_alert);
  CALL sp__setting_int('DNI_CYCLE_DAY', 1, v_day);

  -- 1) Resumen del ciclo actual
  SELECT COALESCE(SUM(billable), 0) AS used,
         COALESCE(SUM(outcome = 'FOUND'), 0) AS found,
         COALESCE(SUM(outcome = 'NOT_FOUND'), 0) AS not_found,
         COALESCE(SUM(outcome IN ('ERROR', 'QUOTA')), 0) AS failed,
         v_quota AS quota, v_alert AS alert_pct, v_day AS cycle_day,
         v_start AS cycle_start, v_end AS cycle_end,
         MAX(created_at) AS last_at
    FROM dni_lookup
   WHERE deleted_at IS NULL AND created_at >= v_start AND created_at < v_end;

  -- 2) Consumo por clínica en el ciclo actual
  SELECT d.tenant_id, COALESCE(t.trade_name, 'Plataforma (super admin)') AS tenant_name,
         SUM(d.billable) AS used, MAX(d.created_at) AS last_at
    FROM dni_lookup d LEFT JOIN tenant t ON t.id = d.tenant_id
   WHERE d.deleted_at IS NULL AND d.created_at >= v_start AND d.created_at < v_end
   GROUP BY d.tenant_id, t.trade_name
   ORDER BY used DESC;

  -- 3) Consumo diario del ciclo actual (fecha de Lima)
  SELECT DATE(d.created_at - INTERVAL 5 HOUR) AS day, SUM(d.billable) AS used
    FROM dni_lookup d
   WHERE d.deleted_at IS NULL AND d.created_at >= v_start AND d.created_at < v_end
   GROUP BY 1 ORDER BY 1;

  -- 4) Histórico: ciclo actual y 5 anteriores
  DROP TEMPORARY TABLE IF EXISTS tmp_dni_cycles;
  CREATE TEMPORARY TABLE tmp_dni_cycles (cycle_start DATETIME, cycle_end DATETIME, used INT);
  SET i = 0;
  WHILE i > -6 DO
    CALL sp__dni_cycle(i, v_s, v_e);
    INSERT INTO tmp_dni_cycles
    SELECT v_s, v_e, COUNT(*) FROM dni_lookup
     WHERE billable = 1 AND deleted_at IS NULL AND created_at >= v_s AND created_at < v_e;
    SET i = i - 1;
  END WHILE;
  SELECT cycle_start, cycle_end, used FROM tmp_dni_cycles ORDER BY cycle_start DESC;
  DROP TEMPORARY TABLE tmp_dni_cycles;
END $$

-- Ajuste del plan contratado (cupo, alerta y día de renovación)
DROP PROCEDURE IF EXISTS sp_dni_settings_save $$
CREATE PROCEDURE sp_dni_settings_save(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_quota INT, IN p_alert_pct INT, IN p_cycle_day INT)
BEGIN
  IF p_quota IS NULL OR p_quota < 0 OR p_alert_pct IS NULL OR p_alert_pct NOT BETWEEN 1 AND 100
     OR p_cycle_day IS NULL OR p_cycle_day NOT BETWEEN 1 AND 28 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION';
  END IF;
  UPDATE platform_setting SET value = CAST(p_quota AS CHAR),     updated_by = p_actor_id WHERE code = 'DNI_MONTHLY_QUOTA';
  UPDATE platform_setting SET value = CAST(p_alert_pct AS CHAR), updated_by = p_actor_id WHERE code = 'DNI_ALERT_PCT';
  UPDATE platform_setting SET value = CAST(p_cycle_day AS CHAR), updated_by = p_actor_id WHERE code = 'DNI_CYCLE_DAY';
  CALL sp_audit_log_add(NULL, p_actor_id, 'platform_setting', 'DNI', 'UPDATE',
       JSON_OBJECT('quota', p_quota, 'alertPct', p_alert_pct, 'cycleDay', p_cycle_day), p_ip);
END $$

DELIMITER ;
