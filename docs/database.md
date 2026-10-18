# Base de datos

MySQL 8 · `utf8mb4_0900_ai_ci` · fechas en **UTC** (`sp_connection_init` fija `time_zone='+00:00'` en cada conexión).

## Política: sólo stored procedures

- La aplicación ejecuta exclusivamente `CALL sp_*` mediante `callSp()` ([src/lib/server/db.ts](../src/lib/server/db.ts)), que además valida el nombre del procedimiento y usa parámetros (`?`), nunca concatenación.
- Usuarios MySQL por ambiente:
  - `odontosis_<env>_app`: **sólo `EXECUTE`** sobre su base. Es el que usa Railway.
  - `odontosis_<env>_migrator`: `ALL` sobre su base (DDL y procedures). Sólo lo usan el migrador local o CI.
  - El admin del servidor sólo se usa para crear bases y usuarios.
- Los procedures corren con `SQL SECURITY DEFINER` (el migrador), por eso la app no necesita permisos sobre tablas.

## Migraciones

```
database/migrations/V000__bootstrap.sql      control de migraciones
database/migrations/V001__schema.sql         tablas
database/migrations/V002__seed_masters.sql   maestros, plan inicial y roles del sistema
database/migrations/V003__payment_documents.sql  factura y comprobante en pagos de suscripción
database/migrations/V004__patient_guardian.sql    apoderado del paciente + catálogo de parentescos
database/migrations/V005__agreements.sql          convenios (empresas/clubes) en paciente y presupuesto
database/migrations/V006__user_permission_overrides.sql  permisos por usuario (budgets.edit)
database/migrations/V007__contracts_implementation.sql  contratos, periodo de implementación y solicitudes
database/migrations/V008__branches.sql            sedes (locales) con límite por plan
database/procedures/0x0_*.sql                stored procedures (repetibles)
```

- `npm run db:migrate` aplica las versionadas pendientes y re-aplica los procedures cuyo checksum cambió.
- Una migración versionada **nunca se edita** después de aplicarse: se crea `V00N__...sql`.
- `--dry-run` muestra lo que se aplicaría. `--reapply-procedures` fuerza a recrear todos los procedures.
- Los archivos usan `DELIMITER $$` y también pueden ejecutarse en MySQL Workbench.

## Convenciones

- PK `CHAR(36)` UUID, generables en el cliente para operar offline (upsert idempotente).
- **Auditoría en todas las tablas:** `created_at, created_by, updated_at, updated_by, deleted_at, deleted_by`.
- **Borrado lógico** (`deleted_at`). La app nunca hace DELETE físico.
- **Bitácora** `audit_log`: cada SP de escritura registra entidad, acción, actor, IP y un resumen JSON. No guarda datos sensibles. También se registran los accesos a fichas clínicas (`VIEW`), los logins y los intentos fallidos.
- **Maestro de maestros:** `master_table` (catálogo) → `master_item` (valores). `tenant_id NULL` = valor global del sistema. Las tablas con `tenant_editable=1` (especialidades, categorías de servicio) admiten valores propios de cada clínica.
- Errores de negocio: `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'APP:<CODIGO>'`. La app los traduce en [errors.ts](../src/lib/server/errors.ts).
- Datos sensibles (`*_enc`) cifrados por la app con AES-256-GCM. La búsqueda por documento usa un *blind index* HMAC (`doc_number_bidx`).

## Tablas

| Tabla | Descripción |
|---|---|
| `master_table`, `master_item` | Catálogos (maestro de maestros) |
| `plan` | Planes: máx. usuarios, pacientes y almacenamiento; precio |
| `tenant` | Clínicas: plan, estado, colores, logo, zona horaria, notas del presupuesto |
| `tenant_payment` | Pagos de suscripción: un pago PAGADO exige N° de factura, factura emitida y comprobante o evidencia; al quedar PAGADO se extiende `subscription_end` |
| `branch` | Sedes (locales) de la clínica. Límite de sedes activas por plan (`plan.max_branches`, Inicial = 1). Siempre hay una sede principal; citas y presupuestos registran su sede |
| `tenant_contract` | Contratos firmados (archivo obligatorio). El inicio/fin oficial de la suscripción (`tenant.subscription_start/end`) se deriva de ellos; no se cruzan entre sí |
| `tenant_request` | Solicitudes de la clínica (mejora, error, consulta, capacitación) atendidas por la plataforma |
| `tenant_sequence` | Correlativos por clínica (H.C., N° de presupuesto) |
| `role`, `app_user`, `user_session` | Seguridad (sesiones guardadas como hash SHA-256 del token) |
| `doctor`, `patient`, `service` | Clínica. El paciente incluye apoderado (obligatorio si es menor de 18 años; validado en el SP) y convenio con N° de socio |
| `agreement` | Maestro de convenios de la clínica (lo administra el administrador): empresa o club, % de descuento y vigencia; el paciente sólo elige convenios del maestro (N° de socio opcional). El presupuesto guarda una copia del nombre y % aplicados |
| `budget`, `budget_item` | Presupuestos (totales calculados en el SP) |
| `odontogram`, `odontogram_mark` | Odontograma del paciente o del presupuesto |
| `appointment` | Citas (control de choques en el SP) |
| `file_asset` | Metadatos de archivos (el binario vive en el volumen `UPLOAD_DIR`) |
| `audit_log` | Bitácora |
| `schema_migration` | Control de migraciones |
