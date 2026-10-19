# Consentimientos del paciente (Perú)

OdontoSis gestiona dos consentimientos por paciente. Cada uno se imprime prellenado, se firma en papel
(firma y huella) y se registra en la ficha con el documento escaneado o fotografiado.

| Consentimiento | Base legal | Contenido principal |
|---|---|---|
| Tratamiento de datos personales | Ley N° 29733, Ley de Protección de Datos Personales, y su Reglamento | Responsable (razón social, RUC, domicilio), datos tratados incluidos **datos sensibles de salud**, finalidades, destinatarios y encargados (proveedores tecnológicos, posible alojamiento fuera del Perú), conservación, seguridad, derechos ARCO y revocación, Autoridad Nacional de Protección de Datos Personales. Autorización **separada y opcional** para comunicaciones comerciales (promociones, saludos de cumpleaños). |
| Confidencialidad de la información clínica | Ley N° 26842, Ley General de Salud (arts. 15 y 25) · Ley N° 29414 | Reserva de la información y secreto profesional, acceso sólo del personal autorizado (con registro de accesos), excepciones legales, derecho de acceso a la historia clínica, autorizaciones específicas (aseguradora, derivación, persona de contacto, uso anonimizado de imágenes). |

**Formatos referenciales.** El texto se basa en la normativa peruana vigente, pero cada clínica debe validarlo con
su asesor legal (y completar sus datos: razón social, RUC, domicilio y correo para solicitudes ARCO en
Configuración). Al cambiar el texto se sube `CONSENT_FORM_VERSION` (`src/lib/shared/schemas.ts`): cada firma
guarda la versión que el paciente leyó.

## Quién firma
- Paciente mayor de edad: el paciente.
- Menor de edad o paciente que requiere apoderado: el padre, madre, tutor o apoderado (nombre, documento y parentesco).

## Registro y trazabilidad
- Tabla `patient_consent` (V021): tipo, versión del formato, firmante (documento cifrado), fecha, autorización
  comercial, archivo firmado (`file_asset` kind `CONSENT`, nunca se elimina) y estado `ACTIVE | REPLACED | REVOKED`.
- Un nuevo registro del mismo tipo deja el anterior como `REPLACED`; la revocación guarda fecha y motivo. Todo queda
  en la bitácora (`audit_log`). El archivo firmado sólo lo ve quien tiene `patients.read`.

## Alertas
- Ficha del paciente: insignia «Faltan consentimientos» y pestaña **Consentimientos**.
- Lista de pacientes: filtro «Sin consentimientos» (con contador) e ícono en cada fila.
- Inicio: pacientes **citados hoy** sin consentimientos y total de la clínica (funciona sin conexión).
