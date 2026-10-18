-- =====================================================================
-- V015 - Control de consumo de la consulta de DNI (proveedor Decolecta)
--   * platform_setting: parámetros globales editables por el super admin
--       DNI_MONTHLY_QUOTA  consultas incluidas en el plan contratado
--       DNI_ALERT_PCT      % de consumo a partir del cual se alerta
--       DNI_CYCLE_DAY      día del mes en que se renueva el cupo (1-28)
--   * dni_lookup: una fila por consulta enviada al proveedor (las respuestas
--     desde caché no se registran porque no consumen cupo). El DNI no se guarda
--     en claro: sólo su blind index (HMAC).
-- =====================================================================

CREATE TABLE platform_setting (
  id          CHAR(36)     NOT NULL,
  code        VARCHAR(60)  NOT NULL,
  name        VARCHAR(150) NOT NULL,
  value       VARCHAR(500) NOT NULL,
  value_type  VARCHAR(20)  NOT NULL DEFAULT 'STRING',   -- STRING | INT
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_platform_setting_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO platform_setting (id, code, name, value, value_type) VALUES
 (UUID(), 'DNI_MONTHLY_QUOTA', 'Consultas de DNI incluidas por mes', '100', 'INT'),
 (UUID(), 'DNI_ALERT_PCT',     'Alerta de consumo de DNI (%)',       '80',  'INT'),
 (UUID(), 'DNI_CYCLE_DAY',     'Día de renovación del cupo de DNI',  '1',   'INT');

CREATE TABLE dni_lookup (
  id          CHAR(36)    NOT NULL,
  tenant_id   CHAR(36)    NULL,             -- NULL = consulta del super admin
  user_id     CHAR(36)    NOT NULL,
  dni_bidx    CHAR(64)    NOT NULL,         -- blind index del DNI consultado
  outcome     VARCHAR(20) NOT NULL,         -- FOUND | NOT_FOUND | ERROR | QUOTA
  billable    TINYINT(1)  NOT NULL DEFAULT 1,
  http_status SMALLINT    NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by CHAR(36) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  PRIMARY KEY (id),
  KEY ix_dni_lookup_created (created_at),
  KEY ix_dni_lookup_tenant (tenant_id, created_at),
  CONSTRAINT fk_dni_lookup_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id),
  CONSTRAINT fk_dni_lookup_user   FOREIGN KEY (user_id)   REFERENCES app_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
