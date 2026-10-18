-- =====================================================================
-- Plataforma (super admin): planes, tenants, pagos, dashboard
-- =====================================================================
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_plan_list $$
CREATE PROCEDURE sp_plan_list()
BEGIN
  SELECT p.id, p.code, p.name, p.description, p.max_users, p.max_branches, p.max_patients, p.max_storage_mb, p.price,
         cur.code AS currency_code, cur.value AS currency_symbol, bp.code AS billing_period_code, bp.name AS billing_period_name,
         p.is_active, p.updated_at,
         (SELECT COUNT(*) FROM tenant t WHERE t.plan_id = p.id AND t.deleted_at IS NULL) AS tenant_count
    FROM plan p
    JOIN master_item cur ON cur.id = p.currency_id
    JOIN master_item bp ON bp.id = p.billing_period_id
   WHERE p.deleted_at IS NULL
   ORDER BY p.price, p.name;
END $$

DROP PROCEDURE IF EXISTS sp_plan_save $$
CREATE PROCEDURE sp_plan_save(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_code VARCHAR(40), IN p_name VARCHAR(120),
  IN p_description VARCHAR(500), IN p_max_users INT, IN p_max_patients INT, IN p_max_storage_mb INT,
  IN p_price DECIMAL(12,2), IN p_currency_code VARCHAR(60), IN p_period_code VARCHAR(60), IN p_is_active TINYINT, IN p_max_branches INT)
BEGIN
  DECLARE v_cur CHAR(36); DECLARE v_per CHAR(36); DECLARE v_action VARCHAR(10);
  CALL sp__master_id('CURRENCY', p_currency_code, NULL, v_cur);
  CALL sp__master_id('BILLING_PERIOD', p_period_code, NULL, v_per);
  IF p_max_users < 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_MAX_USERS'; END IF;
  IF COALESCE(p_max_branches, 0) < 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_MAX_BRANCHES'; END IF;
  IF EXISTS (SELECT 1 FROM plan WHERE code = p_code AND id <> p_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_CODE_TAKEN';
  END IF;
  IF EXISTS (SELECT 1 FROM plan WHERE id = p_id) THEN
    SET v_action = 'UPDATE';
    UPDATE plan SET code = p_code, name = p_name, description = p_description, max_users = p_max_users, max_branches = p_max_branches,
           max_patients = p_max_patients, max_storage_mb = p_max_storage_mb, price = p_price,
           currency_id = v_cur, billing_period_id = v_per, is_active = p_is_active, updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    SET v_action = 'CREATE';
    INSERT INTO plan (id, code, name, description, max_users, max_branches, max_patients, max_storage_mb, price, currency_id,
                      billing_period_id, is_active, created_by, updated_by)
    VALUES (p_id, p_code, p_name, p_description, p_max_users, p_max_branches, p_max_patients, p_max_storage_mb, p_price, v_cur,
            v_per, p_is_active, p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(NULL, p_actor_id, 'plan', p_id, v_action,
       JSON_OBJECT('code', p_code, 'maxUsers', p_max_users, 'maxBranches', p_max_branches, 'price', p_price), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_tenant_list $$
CREATE PROCEDURE sp_tenant_list(IN p_search VARCHAR(100))
BEGIN
  SELECT t.id, t.code, t.legal_name, t.trade_name, t.tax_id, t.email, t.phone,
         p.name AS plan_name, ts.code AS status_code, ts.name AS status_name, ts.value AS status_color,
         COALESCE(t.max_users_override, p.max_users) AS max_users,
         (SELECT COUNT(*) FROM app_user u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND u.is_active = 1) AS active_users,
         t.subscription_start, t.subscription_end, t.implementation_start, t.implementation_end,
         t.primary_color, t.logo_file_id, t.timezone, t.created_at
    FROM tenant t
    JOIN plan p ON p.id = t.plan_id
    JOIN master_item ts ON ts.id = t.status_id
   WHERE t.deleted_at IS NULL
     AND (p_search IS NULL OR p_search = '' OR t.trade_name LIKE CONCAT('%', p_search, '%')
          OR t.legal_name LIKE CONCAT('%', p_search, '%') OR t.code LIKE CONCAT('%', p_search, '%')
          OR t.tax_id LIKE CONCAT(p_search, '%'))
   ORDER BY t.trade_name;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_get $$
CREATE PROCEDURE sp_tenant_get(IN p_id CHAR(36))
BEGIN
  SELECT t.id, t.code, t.legal_name, t.trade_name, t.tax_id, t.email, t.phone, t.address,
         t.plan_id, p.name AS plan_name, p.max_users AS plan_max_users, p.max_branches AS plan_max_branches, t.max_users_override,
         t.max_branches_override, COALESCE(t.max_branches_override, p.max_branches) AS max_branches, t.patient_form_mode,
         (SELECT COUNT(*) FROM branch b WHERE b.tenant_id = t.id AND b.deleted_at IS NULL AND b.is_active = 1) AS active_branches,
         COALESCE(t.max_users_override, p.max_users) AS max_users,
         ts.code AS status_code, ts.name AS status_name, ts.value AS status_color, t.primary_color, t.secondary_color, t.logo_file_id,
         cur.code AS currency_code, t.timezone, t.budget_validity_days, t.budget_notes,
         t.subscription_start, t.subscription_end, t.created_at, t.updated_at,
         t.implementation_start, t.implementation_end, t.implementation_max_patients,
         (SELECT COUNT(*) FROM tenant_contract c WHERE c.tenant_id = t.id AND c.deleted_at IS NULL) AS contract_count,
         (SELECT COUNT(*) FROM app_user u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL AND u.is_active = 1) AS active_users,
         (SELECT COUNT(*) FROM patient pa WHERE pa.tenant_id = t.id AND pa.deleted_at IS NULL) AS patient_count
    FROM tenant t
    JOIN plan p ON p.id = t.plan_id
    JOIN master_item ts ON ts.id = t.status_id
    JOIN master_item cur ON cur.id = t.currency_id
   WHERE t.id = p_id AND t.deleted_at IS NULL;
END $$

-- Crea la clínica y su usuario administrador en una sola transacción
DROP PROCEDURE IF EXISTS sp_tenant_create $$
CREATE PROCEDURE sp_tenant_create(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_code VARCHAR(40),
  IN p_legal_name VARCHAR(200), IN p_trade_name VARCHAR(200), IN p_tax_id VARCHAR(20), IN p_email VARCHAR(200),
  IN p_phone VARCHAR(40), IN p_address VARCHAR(300), IN p_plan_id CHAR(36), IN p_status_code VARCHAR(60),
  IN p_max_users_override INT, IN p_primary_color VARCHAR(7), IN p_secondary_color VARCHAR(7),
  IN p_currency_code VARCHAR(60), IN p_timezone VARCHAR(64), IN p_implementation_start DATE, IN p_implementation_end DATE,
  IN p_implementation_max_patients INT,
  IN p_admin_id CHAR(36), IN p_admin_email VARCHAR(200), IN p_admin_name VARCHAR(200), IN p_admin_password_hash VARCHAR(255))
BEGIN
  DECLARE v_status CHAR(36); DECLARE v_cur CHAR(36); DECLARE v_role CHAR(36);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  CALL sp__master_id('TENANT_STATUS', p_status_code, NULL, v_status);
  CALL sp__master_id('CURRENCY', p_currency_code, NULL, v_cur);
  SELECT id INTO v_role FROM role WHERE code = 'CLINIC_ADMIN' AND tenant_id IS NULL AND deleted_at IS NULL;

  IF NOT EXISTS (SELECT 1 FROM plan WHERE id = p_plan_id AND deleted_at IS NULL AND is_active = 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_NOT_FOUND';
  END IF;
  IF EXISTS (SELECT 1 FROM tenant WHERE code = LOWER(p_code)) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:TENANT_CODE_TAKEN';
  END IF;
  IF EXISTS (SELECT 1 FROM app_user WHERE email = LOWER(TRIM(p_admin_email))) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:EMAIL_TAKEN';
  END IF;
  -- Implementación: exige fechas. Activo (producción): exige al menos un contrato cargado.
  IF p_status_code = 'IMPLEMENTATION' AND (p_implementation_start IS NULL OR p_implementation_end IS NULL
      OR p_implementation_end < p_implementation_start) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:IMPLEMENTATION_DATES_REQUIRED';
  END IF;
  IF p_status_code = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM tenant_contract WHERE tenant_id = p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CONTRACT_REQUIRED';
  END IF;

  START TRANSACTION;
  INSERT INTO tenant (id, code, legal_name, trade_name, tax_id, email, phone, address, plan_id, status_id,
                      max_users_override, primary_color, secondary_color, currency_id, timezone,
                      implementation_start, implementation_end, implementation_max_patients, budget_notes, created_by, updated_by)
  VALUES (p_id, LOWER(p_code), p_legal_name, p_trade_name, p_tax_id, p_email, p_phone, p_address, p_plan_id, v_status,
          p_max_users_override, p_primary_color, p_secondary_color, v_cur, COALESCE(p_timezone, 'America/Lima'),
          p_implementation_start, p_implementation_end, p_implementation_max_patients,
          'Los precios incluyen IGV.\nPresupuesto válido por 15 días.\nLos presupuestos pueden variar de acuerdo a los resultados de los exámenes auxiliares requeridos por el/la doctor(a).\nEl precio de los servicios es por pieza.',
          p_actor_id, p_actor_id);
  INSERT INTO app_user (id, tenant_id, role_id, email, password_hash, full_name, must_change_password, created_by, updated_by)
  VALUES (p_admin_id, p_id, v_role, LOWER(TRIM(p_admin_email)), p_admin_password_hash, p_admin_name, 1, p_actor_id, p_actor_id);
  -- Toda clínica nace con su sede principal
  INSERT INTO branch (id, tenant_id, code, name, address, phone, is_main, is_active, created_by, updated_by)
  VALUES (UUID(), p_id, 'PRINCIPAL', 'Sede principal', p_address, p_phone, 1, 1, p_actor_id, p_actor_id);
  -- ... y su tarifario por defecto
  INSERT INTO price_list (id, tenant_id, code, name, group_name, is_default, is_active, created_by, updated_by)
  VALUES (UUID(), p_id, 'PARTICULAR', 'Particular', 'Tarifario general', 1, 1, p_actor_id, p_actor_id);
  CALL sp_audit_log_add(p_id, p_actor_id, 'tenant', p_id, 'CREATE',
       JSON_OBJECT('code', LOWER(p_code), 'tradeName', p_trade_name, 'planId', p_plan_id, 'adminEmail', LOWER(TRIM(p_admin_email))), p_ip);
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_tenant_update $$
CREATE PROCEDURE sp_tenant_update(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_legal_name VARCHAR(200),
  IN p_trade_name VARCHAR(200), IN p_tax_id VARCHAR(20), IN p_email VARCHAR(200), IN p_phone VARCHAR(40),
  IN p_address VARCHAR(300), IN p_plan_id CHAR(36), IN p_status_code VARCHAR(60), IN p_max_users_override INT,
  IN p_currency_code VARCHAR(60), IN p_timezone VARCHAR(64), IN p_implementation_start DATE, IN p_implementation_end DATE,
  IN p_implementation_max_patients INT, IN p_max_branches_override INT, IN p_patient_form_mode VARCHAR(20))
BEGIN
  DECLARE v_status CHAR(36); DECLARE v_cur CHAR(36);
  CALL sp__master_id('TENANT_STATUS', p_status_code, NULL, v_status);
  CALL sp__master_id('CURRENCY', p_currency_code, NULL, v_cur);
  IF NOT EXISTS (SELECT 1 FROM tenant WHERE id = p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM plan WHERE id = p_plan_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PLAN_NOT_FOUND';
  END IF;
  -- Implementación: exige fechas. Activo (producción): exige al menos un contrato cargado.
  IF p_status_code = 'IMPLEMENTATION' AND (p_implementation_start IS NULL OR p_implementation_end IS NULL
      OR p_implementation_end < p_implementation_start) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:IMPLEMENTATION_DATES_REQUIRED';
  END IF;
  IF p_status_code = 'ACTIVE' AND NOT EXISTS (SELECT 1 FROM tenant_contract WHERE tenant_id = p_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:CONTRACT_REQUIRED';
  END IF;
  -- El inicio/fin oficial de la suscripción NO se edita aquí: se deriva de los contratos
  UPDATE tenant
     SET legal_name = p_legal_name, trade_name = p_trade_name, tax_id = p_tax_id, email = p_email, phone = p_phone,
         address = p_address, plan_id = p_plan_id, status_id = v_status, max_users_override = p_max_users_override,
         currency_id = v_cur, timezone = COALESCE(p_timezone, timezone),
         implementation_start = p_implementation_start, implementation_end = p_implementation_end,
         implementation_max_patients = p_implementation_max_patients, max_branches_override = p_max_branches_override,
         patient_form_mode = IF(p_patient_form_mode IN ('STANDARD', 'ADVANCED'), p_patient_form_mode, patient_form_mode),
         updated_by = p_actor_id
   WHERE id = p_id;
  CALL sp_audit_log_add(p_id, p_actor_id, 'tenant', p_id, 'UPDATE',
       JSON_OBJECT('planId', p_plan_id, 'status', p_status_code, 'maxUsersOverride', p_max_users_override,
                   'implementationStart', p_implementation_start, 'implementationEnd', p_implementation_end), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_tenant_branding_set $$
CREATE PROCEDURE sp_tenant_branding_set(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_primary VARCHAR(7), IN p_secondary VARCHAR(7),
  IN p_logo_file_id CHAR(36), IN p_clear_logo TINYINT)
BEGIN
  IF p_logo_file_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM file_asset WHERE id = p_logo_file_id AND tenant_id = p_id AND kind = 'LOGO' AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FILE_NOT_FOUND';
  END IF;
  UPDATE tenant
     SET primary_color = p_primary, secondary_color = p_secondary,
         logo_file_id = IF(p_clear_logo = 1, NULL, COALESCE(p_logo_file_id, logo_file_id)),
         updated_by = p_actor_id
   WHERE id = p_id AND deleted_at IS NULL;
  CALL sp_audit_log_add(p_id, p_actor_id, 'tenant', p_id, 'BRANDING',
       JSON_OBJECT('primary', p_primary, 'secondary', p_secondary, 'logoFileId', p_logo_file_id), p_ip);
END $$

-- Configuración editable por el administrador de la clínica
DROP PROCEDURE IF EXISTS sp_tenant_settings_update $$
CREATE PROCEDURE sp_tenant_settings_update(
  IN p_tenant_id CHAR(36), IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_trade_name VARCHAR(200),
  IN p_email VARCHAR(200), IN p_phone VARCHAR(40), IN p_address VARCHAR(300),
  IN p_budget_validity_days INT, IN p_budget_notes TEXT)
BEGIN
  UPDATE tenant
     SET trade_name = p_trade_name, email = p_email, phone = p_phone, address = p_address,
         budget_validity_days = p_budget_validity_days, budget_notes = p_budget_notes, updated_by = p_actor_id
   WHERE id = p_tenant_id AND deleted_at IS NULL;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'tenant', p_tenant_id, 'SETTINGS',
       JSON_OBJECT('tradeName', p_trade_name, 'budgetValidityDays', p_budget_validity_days), p_ip);
END $$

DROP PROCEDURE IF EXISTS sp_tenant_payment_list $$
CREATE PROCEDURE sp_tenant_payment_list(IN p_tenant_id CHAR(36))
BEGIN
  SELECT tp.id, tp.tenant_id, t.trade_name AS tenant_name, tp.plan_id, p.name AS plan_name, tp.amount,
         cur.code AS currency_code, cur.value AS currency_symbol, tp.period_start, tp.period_end, tp.paid_at,
         pm.code AS method_code, pm.name AS method_name, ps.code AS status_code, ps.name AS status_name,
         ps.value AS status_color, tp.reference, tp.notes, tp.created_at,
         tp.invoice_number, tp.invoice_file_id, fi.original_name AS invoice_file_name, fi.mime_type AS invoice_mime,
         tp.receipt_file_id, fr.original_name AS receipt_file_name, fr.mime_type AS receipt_mime
    FROM tenant_payment tp
    JOIN tenant t ON t.id = tp.tenant_id
    JOIN plan p ON p.id = tp.plan_id
    JOIN master_item cur ON cur.id = tp.currency_id
    JOIN master_item ps ON ps.id = tp.status_id
    LEFT JOIN master_item pm ON pm.id = tp.method_id
    LEFT JOIN file_asset fi ON fi.id = tp.invoice_file_id
    LEFT JOIN file_asset fr ON fr.id = tp.receipt_file_id
   WHERE tp.deleted_at IS NULL AND (p_tenant_id IS NULL OR tp.tenant_id = p_tenant_id)
   ORDER BY tp.period_start DESC, tp.created_at DESC
   LIMIT 500;
END $$

-- Registra/actualiza un pago. Si queda PAGADO exige factura + comprobante. (La vigencia la definen los contratos.)
DROP PROCEDURE IF EXISTS sp_tenant_payment_save $$
CREATE PROCEDURE sp_tenant_payment_save(
  IN p_actor_id CHAR(36), IN p_ip VARCHAR(64), IN p_id CHAR(36), IN p_tenant_id CHAR(36), IN p_plan_id CHAR(36),
  IN p_amount DECIMAL(12,2), IN p_currency_code VARCHAR(60), IN p_period_start DATE, IN p_period_end DATE,
  IN p_paid_at DATETIME(3), IN p_method_code VARCHAR(60), IN p_status_code VARCHAR(60),
  IN p_reference VARCHAR(120), IN p_notes VARCHAR(500), IN p_invoice_number VARCHAR(40),
  IN p_invoice_file_id CHAR(36), IN p_receipt_file_id CHAR(36))
BEGIN
  DECLARE v_cur CHAR(36); DECLARE v_status CHAR(36); DECLARE v_method CHAR(36) DEFAULT NULL; DECLARE v_action VARCHAR(10);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp__master_id('CURRENCY', p_currency_code, NULL, v_cur);
  CALL sp__master_id('PAYMENT_STATUS', p_status_code, NULL, v_status);
  IF p_method_code IS NOT NULL AND p_method_code <> '' THEN
    CALL sp__master_id('PAYMENT_METHOD', p_method_code, NULL, v_method);
  END IF;
  IF p_period_end < p_period_start THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:INVALID_PERIOD'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tenant WHERE id = p_tenant_id AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:NOT_FOUND';
  END IF;
  -- Pago PAGADO: factura emitida y comprobante/evidencia obligatorios
  IF p_status_code = 'PAID' AND (p_invoice_file_id IS NULL OR p_receipt_file_id IS NULL OR COALESCE(TRIM(p_invoice_number), '') = '') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:PAYMENT_DOCS_REQUIRED';
  END IF;
  IF p_invoice_file_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM file_asset WHERE id = p_invoice_file_id AND tenant_id IS NULL AND kind = 'INVOICE' AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FILE_NOT_FOUND';
  END IF;
  IF p_receipt_file_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM file_asset WHERE id = p_receipt_file_id AND tenant_id IS NULL AND kind = 'PAYMENT_PROOF' AND deleted_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:FILE_NOT_FOUND';
  END IF;

  START TRANSACTION;
  IF EXISTS (SELECT 1 FROM tenant_payment WHERE id = p_id AND tenant_id = p_tenant_id) THEN
    SET v_action = 'UPDATE';
    UPDATE tenant_payment
       SET plan_id = p_plan_id, amount = p_amount, currency_id = v_cur, period_start = p_period_start,
           period_end = p_period_end, paid_at = p_paid_at, method_id = v_method, status_id = v_status,
           reference = p_reference, notes = p_notes, invoice_number = NULLIF(TRIM(p_invoice_number), ''),
           invoice_file_id = p_invoice_file_id, receipt_file_id = p_receipt_file_id, updated_by = p_actor_id
     WHERE id = p_id;
  ELSE
    SET v_action = 'CREATE';
    INSERT INTO tenant_payment (id, tenant_id, plan_id, amount, currency_id, period_start, period_end, paid_at,
                                method_id, status_id, reference, notes, invoice_number, invoice_file_id, receipt_file_id,
                                created_by, updated_by)
    VALUES (p_id, p_tenant_id, p_plan_id, p_amount, v_cur, p_period_start, p_period_end, p_paid_at,
            v_method, v_status, p_reference, p_notes, NULLIF(TRIM(p_invoice_number), ''), p_invoice_file_id, p_receipt_file_id,
            p_actor_id, p_actor_id);
  END IF;
  CALL sp_audit_log_add(p_tenant_id, p_actor_id, 'tenant_payment', p_id, v_action,
       JSON_OBJECT('amount', p_amount, 'status', p_status_code, 'periodStart', p_period_start, 'periodEnd', p_period_end,
                   'invoiceNumber', p_invoice_number, 'invoiceFileId', p_invoice_file_id, 'receiptFileId', p_receipt_file_id), p_ip);
  COMMIT;
END $$

DROP PROCEDURE IF EXISTS sp_platform_dashboard $$
CREATE PROCEDURE sp_platform_dashboard()
BEGIN
  SELECT
    (SELECT COUNT(*) FROM tenant WHERE deleted_at IS NULL) AS tenants_total,
    (SELECT COUNT(*) FROM tenant t JOIN master_item s ON s.id = t.status_id
      WHERE t.deleted_at IS NULL AND s.code IN ('ACTIVE','IMPLEMENTATION')) AS tenants_active,
    (SELECT COUNT(*) FROM app_user WHERE deleted_at IS NULL AND is_active = 1 AND tenant_id IS NOT NULL) AS users_active,
    (SELECT COALESCE(SUM(tp.amount), 0) FROM tenant_payment tp JOIN master_item s ON s.id = tp.status_id
      WHERE tp.deleted_at IS NULL AND s.code = 'PAID'
        AND tp.paid_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')) AS paid_this_month,
    (SELECT COUNT(*) FROM tenant_request r JOIN master_item s ON s.id = r.status_id
      WHERE r.deleted_at IS NULL AND s.code IN ('OPEN', 'IN_PROGRESS')) AS open_requests;

  -- Vencimientos próximos: contrato (producción) o fin de implementación
  SELECT t.id, t.trade_name,
         IF(s.code = 'IMPLEMENTATION', t.implementation_end, t.subscription_end) AS subscription_end,
         IF(s.code = 'IMPLEMENTATION', 'Fin de implementación', 'Fin de contrato') AS due_label,
         s.name AS status_name, s.value AS status_color
    FROM tenant t JOIN master_item s ON s.id = t.status_id
   WHERE t.deleted_at IS NULL AND s.code IN ('ACTIVE', 'IMPLEMENTATION')
     AND IF(s.code = 'IMPLEMENTATION', t.implementation_end, t.subscription_end) IS NOT NULL
     AND IF(s.code = 'IMPLEMENTATION', t.implementation_end, t.subscription_end) <= UTC_DATE() + INTERVAL 15 DAY
   ORDER BY 3
   LIMIT 20;
END $$

DELIMITER ;
