-- =====================================================================
-- V006 - Permisos por usuario (además del rol) y permiso "editar presupuestos"
--   app_user.permission_overrides = {"grant": [...], "deny": [...]}
--   Permiso efectivo = permisos del rol + grant - deny
--   budgets.write = crear presupuestos; budgets.edit = modificar presupuestos ya emitidos
-- =====================================================================
ALTER TABLE app_user
  ADD COLUMN permission_overrides JSON NULL AFTER role_id;

UPDATE role
   SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'budgets.edit'), updated_by = NULL
 WHERE tenant_id IS NULL AND code IN ('CLINIC_ADMIN', 'DOCTOR')
   AND NOT JSON_CONTAINS(permissions, '"budgets.edit"');
