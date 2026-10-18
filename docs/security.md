# Seguridad

## Autenticación
- Contraseñas con **argon2id** (parámetros OWASP: 19 MiB, t=2, p=1). Política: mínimo 10 caracteres con mayúscula, minúscula, número y símbolo.
- Las contraseñas temporales se generan en el servidor, se muestran una sola vez y deben cambiarse en el primer ingreso.
- **Bloqueo de cuenta** tras 5 intentos fallidos (15 min, configurable). **Rate limit** por IP en login, 2FA y cambio de contraseña.
- Respuestas y tiempos uniformes: el login no revela si la cuenta existe (se ejecuta un hash señuelo).
- **2FA TOTP** (RFC 6238) opcional para todos los usuarios y **obligatorio para el super admin en todos los ambientes** (incluido desarrollo). El secreto se guarda cifrado.
- Sesiones: token aleatorio de 256 bits en cookie `__Host-` `HttpOnly; Secure; SameSite=Lax`. En BD sólo se guarda su SHA-256. La expiración es deslizante (12 h) y la sesión puede revocarse. El cambio o reseteo de contraseña y la desactivación del usuario cierran sus sesiones.

## Acceso por clínica
- Cada clínica tiene su link de login `/c/<código>` con su logo y colores. Desde ese link sólo ingresan usuarios de esa clínica (al resto se le responde con el mismo mensaje genérico). El cierre de sesión devuelve a ese link.
- El único dato público de una clínica es su nombre comercial, sus colores y su logo.

## Fases de acceso de una clínica
- **Implementación**: sólo entre `implementation_start` y `implementation_end` (ampliable por el super admin con motivo, registrado en la bitácora). Límites: máximo de pacientes configurable, presupuestos impresos con marca de agua "documento sin validez" y aviso permanente con los días restantes.
- **Activa (producción)**: exige al menos un contrato cargado para activarse y sólo hay acceso con contrato vigente a la fecha.
- **Suspendida / Cancelada**: sin acceso.
- La regla se evalúa en cada request (`tenantAccess` en la sesión); las APIs de una clínica bloqueada responden 403.

## Autorización
- Roles con permisos (`patients.write`, `users.manage`, …) que se validan en cada API route (`route({ perm })`).
- Permisos por usuario (`app_user.permission_overrides`: grant/deny sobre el rol), administrados por la clínica en Usuarios. Ejemplo: `budgets.edit` (modificar, cambiar estado o eliminar presupuestos ya emitidos; crear es `budgets.write`). El SP del presupuesto también lo valida, incluso para cambios que llegan por la sincronización offline.
- **Aislamiento multi-tenant:** el `tenant_id` sale siempre de la sesión del servidor, nunca del cliente, y cada SP filtra por él. Un id de otra clínica responde 404.
- Límites del plan validados en la BD: usuarios activos, pacientes y almacenamiento.

## Datos
- Cifrado en reposo de datos sensibles con **AES-256-GCM** (versionado `v1.` para rotar la clave): documento, teléfono, correo, dirección, alergias, antecedentes, notas y secreto 2FA.
- Búsqueda por documento con *blind index* HMAC-SHA256.
- Usuario de BD de la app con **sólo EXECUTE** (stored procedures). Conexión con TLS opcional (`DB_SSL`).
- La bitácora registra escrituras, logins y accesos a fichas clínicas sin incluir datos sensibles.
- Offline: IndexedDB guarda sólo datos operativos mínimos, separados por usuario y clínica, y se borran al cerrar sesión. El service worker no cachea la API.

## Web
- CSP estricta con **nonce por request** y `strict-dynamic`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`.
- HSTS (producción), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- CSRF: cookie `SameSite=Lax` más verificación de `Origin` en todo método no-GET.
- Validación de entrada con **zod** en el servidor (los mismos esquemas en el cliente).
- Archivos: logos en PNG/JPG/WEBP de hasta 2 MB; documentos de pago (factura y comprobante) en PDF o imagen de hasta 5 MB, sólo visibles para el super admin; validados por *magic bytes*, con nombre aleatorio, servidos con autorización por tenant y `nosniff`. Protección ante path traversal.
- Los errores internos nunca se exponen al cliente.
- Contenedor con usuario sin privilegios (`node`).

## Secretos
- `.env` nunca se commitea. En Railway cada ambiente tiene sus propias variables y credenciales de BD.
- Si se pierde `DATA_ENCRYPTION_KEY`, los datos cifrados no se pueden recuperar: respáldala en un gestor de secretos.

## Auditoría de hacking ético (2026-10-18)
Tres revisiones independientes (autorización y aislamiento; entrada, archivos y denegación de servicio;
autenticación, sesiones y configuración). **No se encontraron fugas entre clínicas** (68 rutas y sus SP revisados).
Hallazgos corregidos, cada uno con su prueba de ataque en `tests/e2e/security-hardening.spec.ts`:

| Hallazgo | Corrección |
|---|---|
| IP tomada de la primera entrada de `X-Forwarded-For` (falsificable): evadía todos los límites | Se usa la entrada que agrega el proxy de confianza (`TRUSTED_PROXY_HOPS`, por defecto 1, desde la derecha) |
| Fuerza bruta del 2FA y reutilización de códigos | Contador de fallos en BD: al 5.º se bloquea la cuenta y se revocan sus sesiones; se rechaza un paso TOTP ya usado; token nuevo tras verificar el 2FA |
| Activar 2FA sin re-autenticación; sin forma de restablecerlo | Exige la contraseña; al activarlo se cierran las demás sesiones; "Restablecer 2FA" para el admin de la clínica y el super admin (auditado) |
| Cuenta bloqueada respondía distinto (enumeración) | Misma respuesta y mismo costo (hash señuelo) que una clave errónea |
| Login: argon2 sin control de concurrencia (CPU) | Semáforo: máx. 4 en paralelo y 50 en cola; el resto 429 |
| Limitador en memoria sin tope (memoria/CPU) | Máx. 50 000 claves con descarte y barrido periódico |
| Binarios huérfanos al fallar la cuota o descartar subidas: llenado del volumen compartido | Se borra el binario si la BD rechaza; se verifica el paciente antes de escribir; recolección horaria (`instrumentation-node.ts`) de descartes, capturas no usadas (> 24 h) y eliminados (clínicos tras 30 días de gracia). La cuota cuenta todo lo que sigue en disco |
| Carrera en la cuota de almacenamiento | `sp_file_create` bloquea la fila de la clínica (`FOR UPDATE`) dentro de una transacción |
| Imágenes con dimensiones absurdas (bomba de descompresión en el navegador) | Se leen las dimensiones de la cabecera (PNG/JPG/WEBP) y se rechazan > 16 000 px o > 80 MP |
| Cupo de DNI agotable por un solo usuario; carreras al superarlo; GET disparable por enlace | Reserva atómica (`sp_dni_reserve`), tope por clínica/mes y por usuario/día, POST con permiso de registro de personas |
| `sync/pull` y archivos clínicos sin verificación de permiso | Cada conjunto se entrega según el permiso de lectura; `PATIENT_FILE` exige `patients.read`; límite por usuario |
| Cuerpos enormes leídos a memoria | `Content-Length` validado antes de leer (2 MB JSON, 16 MB multipart, 8 MB sync) |
| Presupuesto creado como "aprobado" sin permiso de edición | Sin `budgets.edit` sólo se crean borradores |
| La clínica podía quedarse sin administrador | `sp__check_last_admin` |
| Logs con la sentencia SQL interpolada (datos de pacientes, hashes) | Errores de BD saneados: sólo procedimiento y código |
| Datos offline de pacientes en equipos compartidos | Cookie de una jornada (12 h) y sesión con vida máxima de 7 días; la pantalla de login borra los datos locales sin cambios pendientes |
| Otros | Etiqueta GCM de 16 bytes obligatoria; claves de cifrado y blind index distintas; `Origin: null` → 403; paginación acotada; `chown -h` en el contenedor |

Pendiente/aceptado: el limitador es por instancia (si se escala a varias réplicas, mover a Redis); la búsqueda con `LIKE`
no escapa `%`/`_` (sólo afecta el rendimiento dentro de la propia clínica); el super admin puede ver archivos clínicos
(por diseño, para soporte). Recomendado en producción: un WAF/CDN delante (p. ej. Cloudflare) contra DDoS volumétrico.
