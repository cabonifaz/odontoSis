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

## Consulta de DNI (Decolecta)

- `DNI_API_TOKEN` se configura **sólo en producción**: el plan del proveedor tiene un cupo mensual
  compartido y el consumo se registra en la base de cada ambiente (`dni_lookup`).
- El super admin ve el consumo en **Consultas DNI** (`/admin/dni`): barra de uso, proyección al cierre del
  ciclo, consumo por clínica y por día, e histórico de 6 ciclos. Allí se ajusta el plan contratado
  (consultas por mes, % de alerta y día de renovación) al ampliarlo en Decolecta.
- Se alerta en el resumen de plataforma al pasar el % configurado o cuando la proyección supera el cupo.
  Al agotarse, la app deja de llamar al proveedor (`DNI_QUOTA_EXCEEDED`) y se ingresan los datos a mano.
- Cuentan las respuestas con datos y las "sin datos"; no cuentan errores de red/proveedor ni repeticiones
  del mismo DNI en 24 h (caché en memoria del servidor; se pierde al redesplegar).
