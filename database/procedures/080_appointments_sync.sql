-- =====================================================================
-- Citas / agenda, dashboard de clínica y sincronización offline
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_appointment_list $$
CREATE PROCEDURE sp_appointment_list(
  IN p_tenant_id CHAR(36), IN p_from DATETIME(3), IN p_to DATETIME(3), IN p_doctor_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT a.id, a.patient_id, CONCAT(p.first_name, ' ', p.last_name) AS patient_name, p.record_number,
         a.doctor_id, CONCAT(d.first_name, ' ', d.last_name) AS doctor_name, d.agenda_color,
         a.start_at, a.end_at, st.code AS status_code, st.name AS status_name, st.value AS status_color,
         a.reason, a.notes, a.updated_at, a.branch_id, br.name AS branch_name
    FROM appointment a
    LEFT JOIN branch br ON br.id = a.branch_id
    JOIN patient p ON p.id = a.patient_id
    JOIN doctor d ON d.id = a.doctor_id
    JOIN master_item st ON st.id = a.status_id
   WHERE a.tenant_id = p_tenant_id AND a.deleted_at IS NULL
     AND a.start_at < p_to AND a.end_at > p_from
     AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
     AND (p_patient_id IS NULL OR a.patient_id = p_patient_id)
   ORDER BY a.start_at;
END $$

DROP PROCEDURE IF EXISTS sp_appointment_save $$
CREATE PROCEDURE sp_appointment_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_patient_id CHAR(36),
  IN p_doctor_id CHAR(36), IN p_start_at DATETIME(3), IN p_end_at DATETIME(3), IN p_status_code VARCHAR(60),
  IN p_reason VARCHAR(250), IN p_notes TEXT, IN p_branch_id CHAR(36))
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_status CHAR(36); DECLARE v_branch CHAR(36);
  CALL sp__master_id('APPOINTMENT_STATUS', p_status_code, p_tenant_id, v_status);
  CALL sp__branch_resolve(p_tenant_id, p_branch_id, v_branch);
  IF p_end_at <= p_start_at THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_RANGE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM doctor WHERE id = p_doctor_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
  END IF;
  IF p_status_code NOT IN ('CANCELLED', 'NO_SHOW') AND EXISTS (
      SELECT 1 FROM appointment a JOIN master_item s ON s.id = a.status_id
       WHERE a.tenant_id = p_tenant_id AND a.doctor_id = p_doctor_id AND a.id <> p_id AND a.deleted_at IS NULL
         AND s.code NOT IN ('CANCELLED', 'NO_SHOW') AND a.start_at < p_end_at AND a.end_at > p_start_at) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:APPOINTMENT_OVERLAP';
  END IF;
  SELECT tenant_id INTO v_owner FROM appointment WHERE id = p_id;
  IF v_owner IS NOT NULL AND v_owner <> p_tenant_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND'; END IF;

  IF v_owner IS NOT NULL THEN
    UPDATE appointment SET patient_id = p_patient_id, doctor_id = p_doctor_id, branch_id = v_branch, start_at = p_start_at, end_at = p_end_at,
           status_id = v_status, reason = p_reason, notes = p_notes, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  ELSE
    INSERT INTO appointment (id, tenant_id, patient_id, doctor_id, branch_id, start_at, end_at, status_id, reason, notes, created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_patient_id, p_doctor_id, v_branch, p_start_at, p_end_at, v_status, p_reason, p_notes, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'appointment', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('patientId', p_patient_id, 'doctorId', p_doctor_id, 'start', p_start_at, 'status', p_status_code), p_ip);
  SELECT id, updated_at FROM appointment WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS sp_appointment_status_set $$
CREATE PROCEDURE sp_appointment_status_set(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_status_code VARCHAR(60))
BEGIN
  DECLARE v_status CHAR(36);
  CALL sp__master_id('APPOINTMENT_STATUS', p_status_code, p_tenant_id, v_status);
  IF NOT EXISTS (SELECT 1 FROM appointment WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE appointment SET status_id = v_status, updated_by = p_actor_id WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'appointment', p_id, 'STATUS', JSON_OBJECT('status', p_status_code), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_appointment_delete $$
CREATE PROCEDURE sp_appointment_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM appointment WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE appointment SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'appointment', p_id, 'DELETE', NULL, p_ip);
END $$

-- Dashboard de la clínica (rango del día en UTC calculado por la app según zona horaria)
DROP PROCEDURE IF EXISTS sp_tenant_dashboard $$
CREATE PROCEDURE sp_tenant_dashboard(IN p_tenant_id CHAR(36), IN p_day_start DATETIME(3), IN p_day_end DATETIME(3), IN p_doctor_id CHAR(36))
BEGIN
  SELECT
    (SELECT COUNT(*) FROM patient WHERE tenant_id = p_tenant_id AND deleted_at IS NULL) AS patients_total,
    (SELECT COUNT(*) FROM appointment a JOIN master_item s ON s.id = a.status_id
      WHERE a.tenant_id = p_tenant_id AND a.deleted_at IS NULL AND s.code NOT IN ('CANCELLED')
        AND a.start_at >= p_day_start AND a.start_at < p_day_end
        AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)) AS appointments_today,
    (SELECT COUNT(*) FROM budget b JOIN master_item s ON s.id = b.status_id
      WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND s.code IN ('DRAFT','SENT')) AS budgets_pending,
    (SELECT COALESCE(SUM(b.total), 0) FROM budget b JOIN master_item s ON s.id = b.status_id
      WHERE b.tenant_id = p_tenant_id AND b.deleted_at IS NULL AND s.code = 'APPROVED'
        AND b.budget_date >= DATE_FORMAT(p_day_start, '%Y-%m-01')) AS approved_this_month;
  CALL sp_appointment_list(p_tenant_id, p_day_start, p_day_end, p_doctor_id, NULL);
END $$

-- Sincronización offline: devuelve lo cambiado desde p_since (incluye borrados lógicos)
-- Result sets: 1 server_time, 2 master_items, 3 doctors, 4 services, 5 patients, 6 appointments, 7 budgets, 8 agreements,
--              9 branches, 10 price_lists, 11 price_list_items
DROP PROCEDURE IF EXISTS sp_sync_pull $$
CREATE PROCEDURE sp_sync_pull(IN p_tenant_id CHAR(36), IN p_since DATETIME(3))
BEGIN
  DECLARE v_since DATETIME(3) DEFAULT COALESCE(p_since, '1970-01-01');
  SELECT UTC_TIMESTAMP(3) AS server_time;

  SELECT mi.id, mt.code AS table_code, mi.code, mi.name, mi.value, mi.sort_order, mi.is_active, mi.deleted_at, mi.updated_at
    FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
   WHERE (mi.tenant_id IS NULL OR mi.tenant_id = p_tenant_id) AND mi.updated_at > v_since
     AND mt.code NOT IN ('UBIGEO_DEPARTMENT', 'UBIGEO_PROVINCE', 'UBIGEO_DISTRICT');

  SELECT id, first_name, last_name, specialty_id, agenda_color, is_active, deleted_at, updated_at
    FROM doctor WHERE tenant_id = p_tenant_id AND updated_at > v_since;

  SELECT s.id, s.code, s.name, s.category_id, cur.value AS currency_symbol, s.price, s.requires_lab, s.per_piece,
         s.is_active, s.deleted_at, s.updated_at
    FROM service s JOIN master_item cur ON cur.id = s.currency_id
   WHERE s.tenant_id = p_tenant_id AND s.updated_at > v_since;

  -- Datos mínimos de pacientes para trabajar offline (sin historia clínica)
  SELECT p.id, p.record_number, p.first_name, p.last_name, p.birth_date, p.phone_enc, p.insurance_company, p.deductible,
         p.coinsurance_pct, p.requires_guardian, p.guardian_name, gr.name AS guardian_relationship_name, p.guardian_phone_enc,
         p.agreement_id, p.agreement_member_code, p.mother_last_name, p.mobile_enc, p.home_branch_id, p.assigned_doctor_id,
         p.price_list_id, p.titular_patient_id,
         p.is_active, p.deleted_at, p.updated_at
    FROM patient p LEFT JOIN master_item gr ON gr.id = p.guardian_relationship_id
   WHERE p.tenant_id = p_tenant_id AND p.updated_at > v_since;

  SELECT a.id, a.patient_id, a.doctor_id, a.branch_id, a.start_at, a.end_at, st.code AS status_code, a.reason, a.notes, a.deleted_at, a.updated_at
    FROM appointment a JOIN master_item st ON st.id = a.status_id
   WHERE a.tenant_id = p_tenant_id AND a.updated_at > v_since
     AND a.start_at >= UTC_TIMESTAMP() - INTERVAL 30 DAY AND a.start_at < UTC_TIMESTAMP() + INTERVAL 120 DAY;

  SELECT b.id, b.budget_number, b.patient_id, b.doctor_id, b.branch_id, b.budget_date, b.valid_until, st.code AS status_code,
         b.total, b.deleted_at, b.updated_at
    FROM budget b JOIN master_item st ON st.id = b.status_id
   WHERE b.tenant_id = p_tenant_id AND b.updated_at > v_since AND b.budget_date >= UTC_DATE() - INTERVAL 180 DAY;

  SELECT id, code, name, company_name, discount_pct, valid_from, valid_to, requires_member_code, is_active, deleted_at, updated_at
    FROM agreement WHERE tenant_id = p_tenant_id AND updated_at > v_since;

  SELECT id, code, name, address, phone, is_main, is_active, patient_form_mode, deleted_at, updated_at
    FROM branch WHERE tenant_id = p_tenant_id AND updated_at > v_since;

  SELECT id, code, name, group_name, branch_id, is_default, is_active, deleted_at, updated_at
    FROM price_list WHERE tenant_id = p_tenant_id AND updated_at > v_since;

  SELECT id, price_list_id, service_id, price, deleted_at, updated_at
    FROM price_list_item WHERE tenant_id = p_tenant_id AND updated_at > v_since;
END $$

DELIMITER ;
