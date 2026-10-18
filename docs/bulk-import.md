# Carga masiva (periodo de implementación)

Permite cargar desde Excel (`.xlsx`) o CSV la información del sistema anterior de la clínica.

## Quién y cuándo
- **Sólo en implementación**: la clínica debe estar en estado *Implementación* y dentro de su periodo. Se valida en la sesión (`access.phase`), en la API y en cada SP (`sp__import_assert`, error `IMPORT_NOT_AVAILABLE`).
- **Administrador de la clínica** (`settings.manage`): menú *Carga masiva* (`/app/import`), visible sólo durante la implementación.
- **Super admin**: pestaña *Carga masiva* en la ficha de la clínica (`/admin/tenants/<id>`), visible sólo si la clínica está en implementación.

## Orden de carga
| Paso | Entidad | Plantilla | Se reconoce (re-importar) por |
|---|---|---|---|
| 1 | Doctores | `doctores` | código → COP → correo → nombre completo |
| 2 | Convenios | `convenios` | código |
| 3 | Lista de precios (servicios) | `servicios` | código (la categoría se crea si no existe) |
| 4 | Precios por tarifario | `tarifarios` | tarifario + servicio (el tarifario se crea si no existe) |
| 5 | Pacientes | `pacientes` | N° de documento; si no tiene, N° de H.C. |
| 6 | Historias clínicas | `historias` | `codigo_externo`; si no, paciente + fecha + texto |
| 7 | Citas | `citas` | `codigo_externo`; si no, paciente + doctor + fecha/hora |
| 8 | Presupuestos | `presupuestos` (una fila por tratamiento) | `codigo_externo` (se reemplazan sus tratamientos) |

Las columnas, su obligatoriedad y formatos están en [src/lib/shared/import-spec.ts](../src/lib/shared/import-spec.ts) y en la hoja **Instrucciones** de cada plantilla.

## Formato del archivo
- Plantilla `.xlsx` con hojas **Datos** (se llena), **Ejemplo** (filas de ejemplo peruanas), **Instrucciones** (cada columna, obligatoria o no, formato) y **Valores** (catálogos de la clínica: especialidades, parentescos, estados, tarifarios, doctores…). Columnas obligatorias en ámbar.
- CSV UTF-8 (con o sin BOM), separador `;`, `,` o tabulador, con los mismos encabezados. Se puede descargar un CSV de ejemplo.
- Fechas `DD/MM/AAAA` (también celdas de fecha de Excel); horas `HH:MM` 24 h; números con punto o coma decimal; `SI`/`NO`.
- Máximo 10 000 filas y 10 MB. Se valida el tipo por *magic bytes* (ZIP de Excel o texto UTF-8).
- Excel: el ZIP se descomprime en la app con **tope de bytes reales producidos** (fflate: 60 MB por parte, 80 MB en total, tasa máx. 200:1 sobre 10 MB; sin ZIP64 ni cifrado). Sólo se conservan las partes necesarias (workbook, hojas, sharedStrings, styles, rels, [Content_Types]); con ellas se arma un ZIP limpio que se lee en *streaming* (ExcelJS WorkbookReader) y se detiene al superar el máximo de filas.
- Columnas: máximo el doble de las de la plantilla (mín. 20, nunca más de 100); sólo se leen las columnas conocidas.
- Concurrencia: una carga a la vez por clínica y como máximo 2 en el servidor (si no, 429). Límite de peticiones por IP y por usuario + clínica.
- Permisos (usuario de clínica): `settings.manage` para entrar y además el permiso de escritura de cada entidad (`doctors.write`, `services.write`, `patients.write`, `appointments.write`, `budgets.write`); modificar presupuestos existentes exige `budgets.edit` (sin él, los nuevos se guardan como Borrador).
- El reporte de errores (CSV) antepone un apóstrofo a valores que empiezan con = + - @ (evita inyección de fórmulas en Excel).

## Flujo
1. **Validar** (no guarda nada): resumen de filas válidas / con error, registros que se crearán o actualizarán, errores por fila y columna, advertencias (p. ej. “se creará la categoría X”) y reporte descargable en CSV.
2. **Importar**: se guardan sólo las filas válidas, en bloques (500 filas; 100 presupuestos). Cada bloque es una transacción; si falla, sus filas se informan como error y el resto continúa.
3. **Historial**: `import_batch` (entidad, archivo, filas, nuevos/actualizados, estado, usuario).

## Reglas de negocio
- **Pacientes**: mismas validaciones que la ficha (catálogos, apoderado obligatorio para menores, documento único, límites del plan y de la implementación — las filas que exceden el límite se marcan con error). El N° de H.C. anterior se respeta; si va vacío se usa el correlativo, que se adelanta al mayor N° numérico importado **de hasta 6 dígitos** (los más largos se guardan tal cual sin mover el correlativo; correlativos sobre 999999 ya no se truncan). La fila de la clínica se bloquea (`FOR UPDATE`) antes de contar pacientes, también en el alta normal. En pacientes existentes las celdas vacías **no borran** datos. Ficha estándar: paterno + materno se guardan en *Apellidos*. Los campos sensibles se cifran igual que en la ficha (`encrypt` / `blindIndex`). Las validaciones de la ficha avanzada (celular, captación, etc.) no se exigen al importar.
- **Historias**: las notas de evolución van a `patient_clinical_note` (texto cifrado) y se ven en la pestaña *Historia clínica* de la ficha (sólo lectura, la lectura queda en la bitácora). Antecedentes y alergias reemplazan los campos existentes de la ficha.
- **Citas**: se permiten citas pasadas. Las **pasadas** se cargan aunque se crucen con otras (historial del sistema anterior); las **futuras activas** (no canceladas / no asistió) siguen la regla de la agenda: un doctor no puede tener dos citas a la vez. Estado vacío = *Atendida* si ya pasó, *Programada* si es futura. La hora es local de la clínica.
- **Presupuestos**: re-importar sólo actualiza **borradores** (se conservan odontograma, convenio, sede y seguro); uno ya emitido se omite con una advertencia. Cada presupuesto se guarda por separado y los errores se informan por presupuesto. Se guardan con `sp_budget_save` (correlativo, totales, odontograma y auditoría iguales a la pantalla). Precio unitario vacío = precio del tarifario indicado o el del paciente, o el precio base del servicio. `descuento` y `notas` se toman de la primera fila del presupuesto. Si una fila del presupuesto tiene error, se omite el presupuesto completo.

- **Claves únicas** (V019): `(tenant_id, external_code)` en citas y presupuestos y `(tenant_id, code)` en doctores. Al re-importar, el código de un registro eliminado se libera.
- **Notas**: la huella anti-duplicados es un HMAC con separación de dominio y por clínica sobre el texto exacto.

## Rendimiento (staging remoto)
5 000 pacientes: validación ≈ 2,6 s, importación ≈ 17–22 s. 5 000 citas: validación ≈ 2 s, importación ≈ 7–10 s.
