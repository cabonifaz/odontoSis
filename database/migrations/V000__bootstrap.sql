-- =====================================================================
-- V000 - Bootstrap: control de migraciones (ejecutado por el migrador)
-- Todas las tablas llevan campos de auditoría:
--   created_at, created_by, updated_at, updated_by, deleted_at, deleted_by
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migration (
  version      VARCHAR(200) NOT NULL,
  checksum     CHAR(64)     NOT NULL,
  kind         VARCHAR(20)  NOT NULL,          -- VERSIONED | REPEATABLE
  applied_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by   VARCHAR(100) NULL,
  updated_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by   VARCHAR(100) NULL,
  deleted_at   DATETIME(3)  NULL,
  deleted_by   VARCHAR(100) NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_schema_migration_list $$
CREATE PROCEDURE sp_schema_migration_list()
BEGIN
  SELECT version, checksum, kind, applied_at
    FROM schema_migration
   WHERE deleted_at IS NULL;
END $$

DROP PROCEDURE IF EXISTS sp_schema_migration_register $$
CREATE PROCEDURE sp_schema_migration_register(
  IN p_version VARCHAR(200), IN p_checksum CHAR(64), IN p_kind VARCHAR(20), IN p_actor VARCHAR(100))
BEGIN
  INSERT INTO schema_migration (version, checksum, kind, created_by, updated_by)
  VALUES (p_version, p_checksum, p_kind, p_actor, p_actor)
  ON DUPLICATE KEY UPDATE checksum = p_checksum, applied_at = CURRENT_TIMESTAMP(3),
                          updated_by = p_actor, deleted_at = NULL, deleted_by = NULL;
END $$

DELIMITER ;
