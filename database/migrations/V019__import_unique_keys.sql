-- =====================================================================
-- V019 - Claves naturales de la carga masiva únicas por clínica
--   Evita duplicados por cargas concurrentes o re-importaciones: el código externo de citas y
--   presupuestos y el código del doctor no pueden repetirse dentro de una clínica.
--   (NULL se permite muchas veces. Al re-importar, los SP liberan el código de registros eliminados.)
--   Verificado antes de crear: no hay duplicados existentes en staging.
-- =====================================================================
ALTER TABLE appointment
  DROP KEY ix_appt_external,
  ADD UNIQUE KEY uq_appt_external (tenant_id, external_code);

ALTER TABLE budget
  DROP KEY ix_budget_external,
  ADD UNIQUE KEY uq_budget_external (tenant_id, external_code);

ALTER TABLE doctor
  DROP KEY ix_doctor_code,
  ADD UNIQUE KEY uq_doctor_code (tenant_id, code);
