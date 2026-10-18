# Despliegue (Railway)

## Ambientes

| | Staging | Producción |
|---|---|---|
| Rama | `staging` | `main` (sólo PR desde `staging`) |
| BD | `odontosis_staging` | `odontosis_prod` (se crea en la primera publicación) |
| Usuario app (EXECUTE) | `odontosis_stg_app` | `odontosis_prod_app` |
| Usuario migrador | `odontosis_stg_migrator` | `odontosis_prod_migrator` |
| `APP_ENV` | `staging` | `production` |

## Servicio Railway (por ambiente)
- Builder: `Dockerfile` (ver `railway.json`). Healthcheck: `/api/health`.
- **Volumen persistente** montado en `/data`, con `UPLOAD_DIR=/data/uploads`. Los logos y archivos sobreviven a los despliegues.
- Variables: `APP_ENV, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, DB_SSL, DATA_ENCRYPTION_KEY, BLIND_INDEX_KEY, SESSION_SECRET, UPLOAD_DIR`.
  - Las claves (`DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `SESSION_SECRET`) son **distintas por ambiente** y no deben cambiar una vez que hay datos.
  - Las credenciales del migrador **no** se cargan en el servicio de la app.

## Flujo de publicación
1. `npm run typecheck && npm run lint && npm run build && npm run test:e2e`
2. Migrar la BD del ambiente: `npm run db:migrate` con `DB_NAME` y `DB_MIGRATOR_*` del ambiente.
3. Push a `staging`: Railway despliega staging.
4. Validar en staging, abrir PR `staging → main` y repetir el paso 2 contra `odontosis_prod`.

## Primera publicación a producción
1. Crear `odontosis_prod` y los usuarios `odontosis_prod_app` (EXECUTE) y `odontosis_prod_migrator` (ALL sobre esa base).
2. `npm run db:migrate` contra producción.
3. `npm run db:superadmin` contra producción y activar el 2FA del super admin en el primer ingreso.
4. **No** ejecutar `db:seed-demo` en producción (el script lo impide).
