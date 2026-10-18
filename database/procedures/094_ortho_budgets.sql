-- =====================================================================
-- Presupuestos de ortodoncia
-- Montos calculados SIEMPRE en el servidor:
--   descuento = ROUND(total * %convenio / 100, 2); neto = total - descuento
--   cuota     = ROUND((neto - inicial) / N, 2); la última cuota absorbe el redondeo
--   total general = neto + contención (si incluye retenedores)
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_ortho_budget_list $$
CREATE PROCEDURE sp_ortho_budget_list(IN p_tenant_id CHAR(36), IN p_patient_id CHAR(36))
BEGIN
  SELECT ob.id, ob.budget_number, ob.budget_date, ob.valid_until, ob.patient_id,
         CONCAT(p.last_name, ', ', p.first_name) AS patient_name, p.record_number,
         CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
         st.code AS status_code, st.name AS status_name, st.value AS status_color,
         ap.name AS appliance_name, ob.estimated_months, ob.total_amount, ob.net_amount, ob.initial_payment,
         ob.installments, ob.installment_amount, ob.last_installment_amount, ob.grand_total,
         cur.value AS currency_symbol, ob.updated_at
    FROM ortho_budget ob
    JOIN patient p ON p.id = ob.patient_id
    LEFT JOIN doctor d ON d.id = ob.doctor_id
    JOIN master_item st ON st.id = ob.status_id
    JOIN master_item ap ON ap.id = ob.appliance_id
    JOIN master_item cur ON cur.id = ob.currency_id
   WHERE ob.tenant_id = p_tenant_id AND ob.deleted_at IS NULL
     AND (p_patient_id IS NULL OR ob.patient_id = p_patient_id)
   ORDER BY ob.budget_date DESC, ob.budget_number DESC
   LIMIT 500;
END $$

-- 2 result sets: cabecera y cronograma de cuotas (N filas; cuota k vence budget_date + k meses)
DROP PROCEDURE IF EXISTS sp_ortho_budget_get $$
CREATE PROCEDURE sp_ortho_budget_get(IN p_tenant_id CHAR(36), IN p_id CHAR(36))
BEGIN
  DECLARE v_n INT DEFAULT 0; DECLARE v_amt DECIMAL(12,2); DECLARE v_last DECIMAL(12,2); DECLARE v_date DATE;

  SELECT ob.id, ob.budget_number, ob.budget_date, ob.valid_until, ob.patient_id, ob.doctor_id,
         p.first_name AS patient_first_name, p.last_name AS patient_last_name, p.record_number, p.doc_number_enc,
         p.birth_date AS patient_birth_date, p.requires_guardian, p.guardian_name, gr.name AS guardian_relationship_name,
         gdt.code AS guardian_doc_type_code, p.guardian_doc_number_enc,
         dt.code AS doc_type_code, CONCAT(d.first_name, ' ', d.last_name) AS doctor_name, d.license_number AS doctor_license,
         st.code AS status_code, st.name AS status_name, st.value AS status_color,
         ob.appliance_id, ap.code AS appliance_code, ap.name AS appliance_name,
         ob.diagnosis, ob.treatment_plan, ob.estimated_months,
         ob.total_amount, ob.agreement_id, ob.agreement_name, ob.agreement_discount_pct, ob.agreement_discount_amount,
         p.agreement_member_code, ob.net_amount, ob.initial_payment, ob.installments, ob.installment_amount,
         ob.last_installment_amount, ob.includes_retainers, ob.retainer_amount, ob.grand_total,
         cur.code AS currency_code, cur.value AS currency_symbol, ob.notes,
         ob.branch_id, br.name AS branch_name, br.address AS branch_address, br.phone AS branch_phone,
         ob.created_at, ob.updated_at,
         t.trade_name AS tenant_name, t.legal_name AS tenant_legal_name, t.tax_id AS tenant_tax_id,
         t.address AS tenant_address, t.phone AS tenant_phone, t.logo_file_id AS tenant_logo_file_id,
         t.budget_notes AS tenant_budget_notes,
         (SELECT s.code FROM master_item s WHERE s.id = t.status_id) AS tenant_status_code
    FROM ortho_budget ob
    JOIN tenant t ON t.id = ob.tenant_id
    LEFT JOIN branch br ON br.id = ob.branch_id
    JOIN patient p ON p.id = ob.patient_id
    LEFT JOIN master_item dt ON dt.id = p.doc_type_id
    LEFT JOIN master_item gr ON gr.id = p.guardian_relationship_id
    LEFT JOIN master_item gdt ON gdt.id = p.guardian_doc_type_id
    LEFT JOIN doctor d ON d.id = ob.doctor_id
    JOIN master_item st ON st.id = ob.status_id
    JOIN master_item ap ON ap.id = ob.appliance_id
    JOIN master_item cur ON cur.id = ob.currency_id
   WHERE ob.id = p_id AND ob.tenant_id = p_tenant_id AND ob.deleted_at IS NULL;

  SELECT installments, installment_amount, last_installment_amount, budget_date INTO v_n, v_amt, v_last, v_date
    FROM ortho_budget WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL;

  WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < v_n)
  SELECT n AS installment_no, n AS month_index, DATE_ADD(v_date, INTERVAL n MONTH) AS due_date,
         IF(n = v_n, v_last, v_amt) AS amount
    FROM seq
   WHERE v_n > 0
   ORDER BY n;
END $$

-- Upsert idempotente por id. p_can_edit: el usuario tiene budgets.edit (necesario para modificar uno existente)
DROP PROCEDURE IF EXISTS sp_ortho_budget_save $$
CREATE PROCEDURE sp_ortho_budget_save(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_patient_id CHAR(36),
  IN p_doctor_id CHAR(36), IN p_branch_id CHAR(36), IN p_budget_date DATE, IN p_status_code VARCHAR(60),
  IN p_appliance_id CHAR(36), IN p_diagnosis TEXT, IN p_treatment_plan TEXT, IN p_estimated_months INT,
  IN p_total_amount DECIMAL(12,2), IN p_initial_payment DECIMAL(12,2), IN p_installments INT,
  IN p_includes_retainers TINYINT, IN p_retainer_amount DECIMAL(12,2), IN p_agreement_id CHAR(36),
  IN p_notes TEXT, IN p_can_edit TINYINT)
BEGIN
  DECLARE v_owner CHAR(36) DEFAULT NULL; DECLARE v_status CHAR(36); DECLARE v_cur CHAR(36); DECLARE v_days INT;
  DECLARE v_ag_pct DECIMAL(5,2) DEFAULT 0; DECLARE v_ag_name VARCHAR(150) DEFAULT NULL; DECLARE v_branch CHAR(36);
  DECLARE v_seq INT; DECLARE v_total DECIMAL(12,2); DECLARE v_initial DECIMAL(12,2); DECLARE v_disc DECIMAL(12,2);
  DECLARE v_net DECIMAL(12,2); DECLARE v_rest DECIMAL(12,2); DECLARE v_inst DECIMAL(12,2); DECLARE v_last DECIMAL(12,2);
  DECLARE v_ret DECIMAL(12,2); DECLARE v_deleted DATETIME(3) DEFAULT NULL;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  CALL sp__master_id('BUDGET_STATUS', p_status_code, p_tenant_id, v_status);
  IF p_appliance_id IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_CATALOG_VALUE'; END IF;
  CALL sp__master_check('ORTHO_APPLIANCE', p_appliance_id, p_tenant_id);
  SELECT currency_id, budget_validity_days INTO v_cur, v_days FROM tenant WHERE id = p_tenant_id;
  IF NOT EXISTS (SELECT 1 FROM patient WHERE id = p_patient_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PATIENT_NOT_FOUND';
  END IF;
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM doctor WHERE id = p_doctor_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:DOCTOR_NOT_FOUND';
  END IF;
  IF p_budget_date IS NULL OR COALESCE(p_estimated_months, 0) < 1 OR p_estimated_months > 120 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:VALIDATION';
  END IF;
  IF COALESCE(p_installments, 0) < 1 OR p_installments > 120 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:ORTHO_INVALID_INSTALLMENTS';
  END IF;
  IF p_total_amount IS NULL OR p_total_amount < 0 OR COALESCE(p_initial_payment, 0) < 0 OR COALESCE(p_retainer_amount, 0) < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PRICE';
  END IF;

  -- Convenio vigente a la fecha (copia de nombre y %); el descuento se aplica al total antes de las cuotas
  CALL sp__agreement_for_date(p_tenant_id, p_agreement_id, p_budget_date, v_ag_pct, v_ag_name);
  CALL sp__branch_resolve(p_tenant_id, p_branch_id, v_branch);

  SET v_total   = ROUND(p_total_amount, 2);
  SET v_initial = ROUND(COALESCE(p_initial_payment, 0), 2);
  SET v_disc    = ROUND(v_total * v_ag_pct / 100, 2);
  SET v_net     = v_total - v_disc;
  IF v_initial > v_net THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:ORTHO_INITIAL_EXCEEDS_TOTAL'; END IF;
  SET v_rest = v_net - v_initial;
  SET v_inst = ROUND(v_rest / p_installments, 2);
  -- Con muchas cuotas pequeñas el redondeo hacia arriba podría dejar negativa la última: se trunca
  IF v_inst * (p_installments - 1) > v_rest THEN SET v_inst = TRUNCATE(v_rest / p_installments, 2); END IF;
  SET v_last = v_rest - v_inst * (p_installments - 1);
  SET v_ret  = IF(COALESCE(p_includes_retainers, 0) = 1, ROUND(COALESCE(p_retainer_amount, 0), 2), 0);

  SELECT tenant_id, deleted_at INTO v_owner, v_deleted FROM ortho_budget WHERE id = p_id;
  -- De otro tenant o eliminado: no se puede modificar
  IF v_owner IS NOT NULL AND (v_owner <> p_tenant_id OR v_deleted IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  -- Crear requiere budgets.write (validado en la app); modificar uno existente requiere budgets.edit
  IF v_owner IS NOT NULL AND COALESCE(p_can_edit, 0) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:BUDGET_EDIT_FORBIDDEN';
  END IF;

  START TRANSACTION;
  IF v_owner IS NULL THEN
    CALL sp__next_sequence(p_tenant_id, 'ORTHO_BUDGET', p_actor_id, v_seq);
    INSERT INTO ortho_budget (id, tenant_id, budget_number, patient_id, doctor_id, branch_id, budget_date, valid_until, status_id,
                              appliance_id, diagnosis, treatment_plan, estimated_months, total_amount, agreement_id, agreement_name,
                              agreement_discount_pct, agreement_discount_amount, net_amount, initial_payment, installments,
                              installment_amount, last_installment_amount, includes_retainers, retainer_amount, grand_total,
                              currency_id, notes, created_by, updated_by)
    VALUES (p_id, p_tenant_id, LPAD(v_seq, 6, '0'), p_patient_id, p_doctor_id, v_branch, p_budget_date, p_budget_date + INTERVAL v_days DAY,
            v_status, p_appliance_id, p_diagnosis, p_treatment_plan, p_estimated_months, v_total, p_agreement_id, v_ag_name,
            v_ag_pct, v_disc, v_net, v_initial, p_installments, v_inst, v_last, COALESCE(p_includes_retainers, 0), v_ret, v_net + v_ret,
            v_cur, p_notes, p_actor_id, p_actor_id);
  ELSE
    UPDATE ortho_budget
       SET patient_id = p_patient_id, doctor_id = p_doctor_id, branch_id = v_branch, budget_date = p_budget_date,
           valid_until = p_budget_date + INTERVAL v_days DAY, status_id = v_status, appliance_id = p_appliance_id,
           diagnosis = p_diagnosis, treatment_plan = p_treatment_plan, estimated_months = p_estimated_months,
           total_amount = v_total, agreement_id = p_agreement_id, agreement_name = v_ag_name, agreement_discount_pct = v_ag_pct,
           agreement_discount_amount = v_disc, net_amount = v_net, initial_payment = v_initial, installments = p_installments,
           installment_amount = v_inst, last_installment_amount = v_last, includes_retainers = COALESCE(p_includes_retainers, 0),
           retainer_amount = v_ret, grand_total = v_net + v_ret, notes = p_notes, updated_by = p_actor_id
     WHERE id = p_id AND tenant_id = p_tenant_id;
  END IF;

  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'ortho_budget', p_id, IF(v_owner IS NULL, 'CREATE', 'UPDATE'),
       JSON_OBJECT('patientId', p_patient_id, 'status', p_status_code, 'total', v_total, 'agreement', v_ag_name,
                   'agreementPct', v_ag_pct, 'net', v_net, 'initial', v_initial, 'installments', p_installments,
                   'installmentAmount', v_inst, 'lastInstallment', v_last, 'retainers', v_ret), p_ip);
  COMMIT;
  SELECT id, budget_number, total_amount, agreement_discount_amount, net_amount, initial_payment, installments,
         installment_amount, last_installment_amount, retainer_amount, grand_total, updated_at
    FROM ortho_budget WHERE id = p_id;
END $$

DROP PROCEDURE IF EXISTS sp_ortho_budget_delete $$
CREATE PROCEDURE sp_ortho_budget_delete(IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ortho_budget WHERE id = p_id AND tenant_id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  UPDATE ortho_budget SET deleted_at = UTC_TIMESTAMP(3), deleted_by = p_actor_id, updated_by = p_actor_id
   WHERE id = p_id AND tenant_id = p_tenant_id;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'ortho_budget', p_id, 'DELETE', NULL, p_ip);
END $$

DELIMITER ;
