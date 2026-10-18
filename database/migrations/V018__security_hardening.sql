-- =====================================================================
-- V018 - Endurecimiento de seguridad (auditoría ética)
--   * 2FA: contador de fallos por usuario (bloqueo) y último paso TOTP usado (anti-repetición)
--   * Archivos: purged_at = binario ya eliminado del volumen (recolección de huérfanos)
--   * DNI: tope mensual por clínica y diario por usuario (cupo compartido de la plataforma)
-- =====================================================================

ALTER TABLE app_user
  ADD COLUMN mfa_failed_count SMALLINT NOT NULL DEFAULT 0 AFTER failed_login_count,
  ADD COLUMN totp_last_step   BIGINT   NULL AFTER mfa_failed_count;

ALTER TABLE file_asset
  ADD COLUMN purged_at DATETIME(3) NULL AFTER deleted_by,
  ADD KEY ix_file_asset_gc (deleted_at, purged_at),
  ADD KEY ix_file_asset_kind (kind, created_at);

ALTER TABLE dni_lookup
  ADD KEY ix_dni_lookup_user (user_id, created_at);

INSERT INTO platform_setting (id, code, name, value, value_type) VALUES
 (UUID(), 'DNI_TENANT_MONTHLY_CAP', 'Máximo de consultas de DNI por clínica al mes (0 = sin tope)', '0', 'INT'),
 (UUID(), 'DNI_USER_DAILY_CAP',     'Máximo de consultas de DNI por usuario al día',                '30', 'INT');
