-- =====================================================================
-- V009 - Las sedes las habilita el super admin por clínica.
-- Límite de sedes activas = tenant.max_branches_override (si existe) o plan.max_branches.
-- =====================================================================
ALTER TABLE tenant
  ADD COLUMN max_branches_override INT NULL AFTER max_users_override;
