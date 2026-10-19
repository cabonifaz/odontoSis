# OdontoSis

Sistema SaaS multi-clínica (multi-tenant) para la gestión de clínicas odontológicas.

**Stack:** Next.js 15 (monolito, App Router) · TypeScript · Tailwind CSS v4 · MySQL 8 (solo stored procedures) · PWA offline-first (Serwist + IndexedDB/Dexie) · Playwright.

## Módulos

| Módulo | Qué incluye |
|---|---|
| **Pacientes (clientes)** | Ficha con H.C. correlativa, datos sensibles cifrados, seguro (deducible por pieza y coaseguro), odontograma general, presupuestos y citas del paciente. |
| **Presupuestos / odontograma** | Odontograma FDI interactivo (permanentes y temporales, 5 superficies), hallazgos, tratamientos por pieza/superficie desde la lista de precios, cálculo con seguro y documento imprimible (PDF) igual al formato físico. |
| **Citas / agenda** | Vista semana/día, filtro por doctor, control de choque de horarios y estados (programada, confirmada, atendida, cancelada, no asistió). |
| **Doctores / usuarios / roles** | Doctores (COP, especialidad, color de agenda), usuarios con roles (Administrador, Odontólogo, Recepción), límite de usuarios por plan. |
| **Lista de precios** | Servicios por categoría, precio y laboratorio. |
| **Carga masiva** | Sólo durante la implementación (administrador de la clínica o super admin): plantillas Excel/CSV con instrucciones y ejemplos para doctores, convenios, lista de precios y tarifarios, pacientes (con su H.C. anterior), historias clínicas, citas y presupuestos; validación previa con errores por fila e importación idempotente. Ver [docs/bulk-import.md](docs/bulk-import.md). |
| **Consentimientos** | Formatos prellenados de tratamiento de datos personales (Ley N° 29733) y confidencialidad clínica (Ley N° 26842), firma del paciente o su apoderado, registro del documento firmado, historial y revocación; alertas de pacientes sin consentimientos. Ver [docs/consents.md](docs/consents.md). |
| **Super admin (plataforma)** | Clínicas (tenants), planes y límites, pagos/suscripción, colores y logo de cada clínica, usuarios de cada clínica, catálogos (maestro de maestros). |

El primer plan (**STARTER**) permite hasta **5 usuarios activos**. El límite se valida en la base de datos.

## Arquitectura

```
src/
  app/            páginas (app/ = clínica, admin/ = plataforma) y API routes (app/api/**)
  components/     UI (design system), odontograma, presupuestos, shell
  lib/server/     acceso a BD (sólo CALL sp_*), sesión, cifrado, guards, servicios de dominio
  lib/client/     API client, base offline (Dexie) y motor de sincronización
  lib/shared/     esquemas zod compartidos, tipos y formatos
database/
  migrations/     V###__*.sql   (versionadas, inmutables: tablas y datos maestros)
  procedures/     *.sql         (stored procedures, repetibles)
scripts/          migrador, creación de super admin, datos demo
tests/e2e/        Playwright
docs/             design system, base de datos, seguridad, despliegue
```

### Reglas de base de datos

- **Todo acceso a datos es por stored procedures.** El backend sólo ejecuta `CALL sp_*(?)` mediante [`src/lib/server/db.ts`](src/lib/server/db.ts). No hay SQL de datos en el código.
- El usuario MySQL de la app tiene **únicamente `EXECUTE`**. Un usuario *migrador* aparte aplica DDL y procedures.
- **Auditoría en todas las tablas:** `created_at/by`, `updated_at/by`, `deleted_at/by` (borrado lógico) + `audit_log` con el detalle de cada operación.
- **Maestro de maestros:** `master_table` + `master_item` para todos los catálogos (estados, tipos de documento, especialidades, hallazgos del odontograma…).
- Aislamiento multi-tenant: cada SP filtra por `p_tenant_id`, que proviene **siempre** de la sesión del servidor.

Ver [docs/database.md](docs/database.md).

### Offline

- El service worker precachea la app y las páginas visitadas. La API nunca se cachea.
- Pacientes (datos mínimos), doctores, lista de precios, catálogos, citas (−30/+120 días) y presupuestos (6 meses) se sincronizan a IndexedDB.
- Altas y ediciones sin conexión (pacientes, citas, presupuestos) se guardan en una cola local y se envían al reconectar. Son idempotentes (upsert por UUID generado en el cliente).
- La base local se separa por usuario y clínica, y se borra al cerrar sesión. La historia clínica y los datos sensibles nunca se guardan offline.

## Desarrollo local

```bash
npm install
cp .env.example .env              # completar credenciales y claves
npm run db:migrate                # aplica migraciones + procedures (usuario migrador)
npm run db:superadmin             # crea el super admin (SUPERADMIN_* en .env)
npm run db:seed-demo              # (opcional, NO prod) clínica demo + lista de precios de ejemplo
npm run dev
```

## Pruebas

```bash
npm run typecheck && npm run lint
npm run build && npx next start -p 3100   # el modo offline se prueba con build de producción
npm run test:e2e
```

## Ambientes

| Rama | Ambiente | Base de datos |
|---|---|---|
| `staging` | Railway staging | `odontosis_staging` |
| `main` | Railway producción | `odontosis_prod` (se crea en la primera publicación) |

`main` sólo recibe cambios vía PR desde `staging`. Ver [docs/deploy.md](docs/deploy.md).
