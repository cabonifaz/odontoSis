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
