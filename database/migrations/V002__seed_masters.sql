-- =====================================================================
-- V002 - Datos maestros del sistema (maestro de maestros, planes, roles)
-- =====================================================================

-- ---------- master_table ----------
INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'CURRENCY',           'Monedas',                    NULL, 0, 1),
 (UUID(), 'BILLING_PERIOD',     'Periodos de facturación',    NULL, 0, 1),
 (UUID(), 'TENANT_STATUS',      'Estados de clínica (tenant)',NULL, 0, 1),
 (UUID(), 'PAYMENT_STATUS',     'Estados de pago',            NULL, 0, 1),
 (UUID(), 'PAYMENT_METHOD',     'Métodos de pago',            NULL, 0, 1),
 (UUID(), 'DOC_TYPE',           'Tipos de documento',         NULL, 0, 1),
 (UUID(), 'SEX',                'Sexo',                       NULL, 0, 1),
 (UUID(), 'SPECIALTY',          'Especialidades',             NULL, 1, 1),
 (UUID(), 'SERVICE_CATEGORY',   'Categorías de servicio',     NULL, 1, 1),
 (UUID(), 'APPOINTMENT_STATUS', 'Estados de cita',            NULL, 0, 1),
 (UUID(), 'BUDGET_STATUS',      'Estados de presupuesto',     NULL, 0, 1),
 (UUID(), 'TOOTH_SURFACE',      'Superficies dentales',       NULL, 0, 1),
 (UUID(), 'TOOTH_CONDITION',    'Hallazgos de odontograma',   NULL, 0, 1);

-- ---------- master_item (globales) ----------
INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, v.value, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'CURRENCY' t, 'PEN' code, 'Soles' name, 'S/' value, 1 ord UNION ALL
    SELECT 'CURRENCY', 'USD', 'Dólares', '$', 2 UNION ALL
    SELECT 'BILLING_PERIOD', 'MONTHLY', 'Mensual', '1', 1 UNION ALL
    SELECT 'BILLING_PERIOD', 'YEARLY', 'Anual', '12', 2 UNION ALL
    SELECT 'TENANT_STATUS', 'TRIAL', 'Prueba', '#0EA5E9', 1 UNION ALL
    SELECT 'TENANT_STATUS', 'ACTIVE', 'Activo', '#16A34A', 2 UNION ALL
    SELECT 'TENANT_STATUS', 'SUSPENDED', 'Suspendido', '#F59E0B', 3 UNION ALL
    SELECT 'TENANT_STATUS', 'CANCELLED', 'Cancelado', '#DC2626', 4 UNION ALL
    SELECT 'PAYMENT_STATUS', 'PENDING', 'Pendiente', '#F59E0B', 1 UNION ALL
    SELECT 'PAYMENT_STATUS', 'PAID', 'Pagado', '#16A34A', 2 UNION ALL
    SELECT 'PAYMENT_STATUS', 'VOID', 'Anulado', '#6B7280', 3 UNION ALL
    SELECT 'PAYMENT_METHOD', 'TRANSFER', 'Transferencia', NULL, 1 UNION ALL
    SELECT 'PAYMENT_METHOD', 'CARD', 'Tarjeta', NULL, 2 UNION ALL
    SELECT 'PAYMENT_METHOD', 'CASH', 'Efectivo', NULL, 3 UNION ALL
    SELECT 'PAYMENT_METHOD', 'YAPE', 'Yape', NULL, 4 UNION ALL
    SELECT 'PAYMENT_METHOD', 'PLIN', 'Plin', NULL, 5 UNION ALL
    SELECT 'DOC_TYPE', 'DNI', 'DNI', '8', 1 UNION ALL
    SELECT 'DOC_TYPE', 'CE', 'Carné de extranjería', '12', 2 UNION ALL
    SELECT 'DOC_TYPE', 'PAS', 'Pasaporte', '12', 3 UNION ALL
    SELECT 'DOC_TYPE', 'RUC', 'RUC', '11', 4 UNION ALL
    SELECT 'SEX', 'F', 'Femenino', NULL, 1 UNION ALL
    SELECT 'SEX', 'M', 'Masculino', NULL, 2 UNION ALL
    SELECT 'SEX', 'X', 'Otro / No especifica', NULL, 3 UNION ALL
    SELECT 'SPECIALTY', 'GEN', 'Odontología general', NULL, 1 UNION ALL
    SELECT 'SPECIALTY', 'ORT', 'Ortodoncia', NULL, 2 UNION ALL
    SELECT 'SPECIALTY', 'END', 'Endodoncia', NULL, 3 UNION ALL
    SELECT 'SPECIALTY', 'PER', 'Periodoncia', NULL, 4 UNION ALL
    SELECT 'SPECIALTY', 'PED', 'Odontopediatría', NULL, 5 UNION ALL
    SELECT 'SPECIALTY', 'IMP', 'Implantología', NULL, 6 UNION ALL
    SELECT 'SPECIALTY', 'REH', 'Rehabilitación oral', NULL, 7 UNION ALL
    SELECT 'SPECIALTY', 'CIR', 'Cirugía bucal', NULL, 8 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'DIAG', 'Diagnóstico', NULL, 1 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'PREV', 'Prevención', NULL, 2 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'OPER', 'Operatoria', NULL, 3 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'ENDO', 'Endodoncia', NULL, 4 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'CIRU', 'Cirugía', NULL, 5 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'PEDI', 'Odontopediatría', NULL, 6 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'REHA', 'Rehabilitación', NULL, 7 UNION ALL
    SELECT 'SERVICE_CATEGORY', 'IMPL', 'Implantes', NULL, 8 UNION ALL
    SELECT 'APPOINTMENT_STATUS', 'SCHEDULED', 'Programada', '#0EA5E9', 1 UNION ALL
    SELECT 'APPOINTMENT_STATUS', 'CONFIRMED', 'Confirmada', '#16A34A', 2 UNION ALL
    SELECT 'APPOINTMENT_STATUS', 'ATTENDED', 'Atendida', '#6366F1', 3 UNION ALL
    SELECT 'APPOINTMENT_STATUS', 'CANCELLED', 'Cancelada', '#6B7280', 4 UNION ALL
    SELECT 'APPOINTMENT_STATUS', 'NO_SHOW', 'No asistió', '#DC2626', 5 UNION ALL
    SELECT 'BUDGET_STATUS', 'DRAFT', 'Borrador', '#6B7280', 1 UNION ALL
    SELECT 'BUDGET_STATUS', 'SENT', 'Entregado', '#0EA5E9', 2 UNION ALL
    SELECT 'BUDGET_STATUS', 'APPROVED', 'Aprobado', '#16A34A', 3 UNION ALL
    SELECT 'BUDGET_STATUS', 'REJECTED', 'Rechazado', '#DC2626', 4 UNION ALL
    SELECT 'BUDGET_STATUS', 'EXPIRED', 'Vencido', '#F59E0B', 5 UNION ALL
    SELECT 'TOOTH_SURFACE', 'O', 'Oclusal / Incisal', NULL, 1 UNION ALL
    SELECT 'TOOTH_SURFACE', 'V', 'Vestibular', NULL, 2 UNION ALL
    SELECT 'TOOTH_SURFACE', 'L', 'Lingual / Palatino', NULL, 3 UNION ALL
    SELECT 'TOOTH_SURFACE', 'M', 'Mesial', NULL, 4 UNION ALL
    SELECT 'TOOTH_SURFACE', 'D', 'Distal', NULL, 5 UNION ALL
    -- value: JSON {color, scope: surface|tooth, symbol}
    SELECT 'TOOTH_CONDITION', 'CARIES',      'Caries',                '{"color":"#DC2626","scope":"surface","symbol":"fill"}', 1 UNION ALL
    SELECT 'TOOTH_CONDITION', 'RESTORATION', 'Restauración',          '{"color":"#2563EB","scope":"surface","symbol":"fill"}', 2 UNION ALL
    SELECT 'TOOTH_CONDITION', 'SEALANT',     'Sellante',              '{"color":"#16A34A","scope":"surface","symbol":"fill"}', 3 UNION ALL
    SELECT 'TOOTH_CONDITION', 'EXTRACTION',  'Extracción indicada',   '{"color":"#DC2626","scope":"tooth","symbol":"cross"}', 4 UNION ALL
    SELECT 'TOOTH_CONDITION', 'MISSING',     'Pieza ausente',         '{"color":"#2563EB","scope":"tooth","symbol":"cross"}', 5 UNION ALL
    SELECT 'TOOTH_CONDITION', 'IMPLANT',     'Implante',              '{"color":"#DC2626","scope":"tooth","symbol":"ellipse"}', 6 UNION ALL
    SELECT 'TOOTH_CONDITION', 'CROWN',       'Corona',                '{"color":"#2563EB","scope":"tooth","symbol":"circle"}', 7 UNION ALL
    SELECT 'TOOTH_CONDITION', 'ENDODONTICS', 'Endodoncia',            '{"color":"#DC2626","scope":"tooth","symbol":"line"}', 8 UNION ALL
    SELECT 'TOOTH_CONDITION', 'FRACTURE',    'Fractura',              '{"color":"#DC2626","scope":"tooth","symbol":"zigzag"}', 9
  ) v ON v.t = mt.code;

-- ---------- Plan inicial (hasta 5 usuarios) ----------
INSERT INTO plan (id, code, name, description, max_users, max_patients, max_storage_mb, price, currency_id, billing_period_id)
SELECT UUID(), 'STARTER', 'Plan Inicial', 'Hasta 5 usuarios', 5, NULL, 1024, 0.00,
       (SELECT mi.id FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id WHERE mt.code='CURRENCY' AND mi.code='PEN'),
       (SELECT mi.id FROM master_item mi JOIN master_table mt ON mt.id = mi.master_table_id WHERE mt.code='BILLING_PERIOD' AND mi.code='MONTHLY');

-- ---------- Roles del sistema ----------
INSERT INTO role (id, tenant_id, code, name, description, permissions, is_system) VALUES
 (UUID(), NULL, 'SUPER_ADMIN',  'Super administrador', 'Administración de la plataforma', JSON_ARRAY('platform.*'), 1),
 (UUID(), NULL, 'CLINIC_ADMIN', 'Administrador de clínica', 'Acceso total a su clínica',
   JSON_ARRAY('patients.read','patients.write','budgets.read','budgets.write','appointments.read','appointments.write',
              'doctors.read','doctors.write','services.read','services.write','users.manage','settings.manage','catalogs.manage'), 1),
 (UUID(), NULL, 'DOCTOR', 'Odontólogo', 'Atención clínica',
   JSON_ARRAY('patients.read','patients.write','budgets.read','budgets.write','appointments.read','appointments.write',
              'doctors.read','services.read'), 1),
 (UUID(), NULL, 'RECEPTIONIST', 'Recepción', 'Agenda y admisión',
   JSON_ARRAY('patients.read','patients.write','budgets.read','appointments.read','appointments.write','doctors.read','services.read'), 1);
