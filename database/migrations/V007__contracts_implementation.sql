-- =====================================================================
-- V007 - Contratos de suscripción, periodo de implementación y solicitudes de mejora
--
-- Fases de acceso de una clínica:
--   IMPLEMENTATION : periodo de implementación (entrenamiento, carga de datos, pruebas) con límites
--   ACTIVE         : producción; exige un contrato vigente (el inicio/fin oficial sale de los contratos)
--   SUSPENDED / CANCELLED : sin acceso
-- =====================================================================

-- Estado "Implementación" reemplaza a "Prueba"
INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, 'IMPLEMENTATION', 'Implementación', '#0EA5E9', 1, 1
  FROM master_table mt WHERE mt.code = 'TENANT_STATUS';

UPDATE tenant t
  JOIN master_item old ON old.id = t.status_id AND old.code = 'TRIAL'
  JOIN master_table mt ON mt.code = 'TENANT_STATUS'
  JOIN master_item imp ON imp.master_table_id = mt.id AND imp.code = 'IMPLEMENTATION'
   SET t.status_id = imp.id;

UPDATE master_item mi JOIN master_table mt ON mt.id = mi.master_table_id
   SET mi.is_active = 0
 WHERE mt.code = 'TENANT_STATUS' AND mi.code = 'TRIAL';

-- Periodo de implementación y sus límites
ALTER TABLE tenant
  ADD COLUMN implementation_start        DATE NULL AFTER subscription_end,
  ADD COLUMN implementation_end          DATE NULL AFTER implementation_start,
  ADD COLUMN implementation_max_patients INT  NULL AFTER implementation_end;

-- Clínicas que estaban en "Prueba": 30 días de implementación desde hoy
UPDATE tenant t
  JOIN master_item s ON s.id = t.status_id AND s.code = 'IMPLEMENTATION'
   SET t.implementation_start = COALESCE(t.implementation_start, UTC_DATE()),
       t.implementation_end   = COALESCE(t.implementation_end, UTC_DATE() + INTERVAL 30 DAY),
       t.implementation_max_patients = COALESCE(t.implementation_max_patients, 200);

-- Contratos que sustentan el inicio y fin de la suscripción
CREATE TABLE tenant_contract (
  id              CHAR(36)     NOT NULL,
  tenant_id       CHAR(36)     NOT NULL,
  contract_number VARCHAR(40)  NOT NULL,
  start_date      DATE         NOT NULL,
  end_date        DATE         NOT NULL,
  file_id         CHAR(36)     NOT NULL,          -- archivo de plataforma (kind CONTRACT)
  signed_at       DATE         NULL,
  notes           VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_contract_tenant (tenant_id, start_date),
  CONSTRAINT fk_contract_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT fk_contract_file   FOREIGN KEY (file_id)   REFERENCES file_asset(id),
  CONSTRAINT ck_contract_range CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Solicitudes de la clínica (mejoras, errores, consultas) atendidas por la plataforma
INSERT INTO master_table (id, code, name, description, tenant_editable, is_system) VALUES
 (UUID(), 'REQUEST_TYPE',   'Tipos de solicitud',   NULL, 0, 1),
 (UUID(), 'REQUEST_STATUS', 'Estados de solicitud', NULL, 0, 1);

INSERT INTO master_item (id, master_table_id, code, name, value, sort_order, is_system)
SELECT UUID(), mt.id, v.code, v.name, v.value, v.ord, 1
  FROM master_table mt
  JOIN (
    SELECT 'REQUEST_TYPE' t, 'IMPROVEMENT' code, 'Mejora' name, '#6366F1' value, 1 ord UNION ALL
    SELECT 'REQUEST_TYPE', 'BUG', 'Error', '#DC2626', 2 UNION ALL
    SELECT 'REQUEST_TYPE', 'QUESTION', 'Consulta', '#0EA5E9', 3 UNION ALL
    SELECT 'REQUEST_TYPE', 'TRAINING', 'Capacitación', '#16A34A', 4 UNION ALL
    SELECT 'REQUEST_STATUS', 'OPEN', 'Abierta', '#F59E0B', 1 UNION ALL
    SELECT 'REQUEST_STATUS', 'IN_PROGRESS', 'En proceso', '#0EA5E9', 2 UNION ALL
    SELECT 'REQUEST_STATUS', 'DONE', 'Atendida', '#16A34A', 3 UNION ALL
    SELECT 'REQUEST_STATUS', 'REJECTED', 'Descartada', '#6B7280', 4
  ) v ON v.t = mt.code;

CREATE TABLE tenant_request (
  id          CHAR(36)      NOT NULL,
  tenant_id   CHAR(36)      NOT NULL,
  type_id     CHAR(36)      NOT NULL,
  status_id   CHAR(36)      NOT NULL,
  title       VARCHAR(200)  NOT NULL,
  description TEXT          NOT NULL,
  response    TEXT          NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_request_tenant (tenant_id, created_at),
  CONSTRAINT fk_request_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT fk_request_type   FOREIGN KEY (type_id)   REFERENCES master_item(id),
  CONSTRAINT fk_request_status FOREIGN KEY (status_id) REFERENCES master_item(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
