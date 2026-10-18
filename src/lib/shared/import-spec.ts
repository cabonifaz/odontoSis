/**
 * Carga masiva: entidades, orden de carga, columnas de cada plantilla y ejemplos.
 * Compartido entre el servidor (plantillas y validación) y la pantalla de importación.
 */

export const IMPORT_ENTITIES = ['DOCTORS', 'AGREEMENTS', 'SERVICES', 'PRICE_LIST_ITEMS', 'PATIENTS', 'CLINICAL_NOTES', 'APPOINTMENTS', 'BUDGETS'] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

export type ImportColumn = {
  key: string;
  /** true = obligatoria; 'cond' = obligatoria según otras columnas (se explica en la descripción) */
  required?: boolean | 'cond';
  description: string;
  /** Valores aceptados / formato */
  format?: string;
};

export type ImportEntitySpec = {
  code: ImportEntity;
  slug: string;
  step: number;
  title: string;
  summary: string;
  /** Qué debe cargarse antes */
  dependsOn: string | null;
  /** Cómo se reconoce un registro existente al volver a subir el archivo */
  matchBy: string;
  columns: ImportColumn[];
  examples: Record<string, string>[];
};

export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

const DATE = 'Fecha DD/MM/AAAA (también acepta celdas de fecha de Excel)';
const YESNO = 'SI / NO';

const PATIENT_REF: ImportColumn[] = [
  { key: 'paciente_documento', required: 'cond', description: 'N° de documento del paciente (ya cargado en el paso Pacientes). Usa esta columna o paciente_hc.' },
  { key: 'paciente_hc', required: 'cond', description: 'N° de historia clínica del paciente. Usa esta columna o paciente_documento.' },
];
const DOCTOR_REF = 'Código del doctor, N° de COP, correo o nombre completo tal como se cargó en el paso Doctores';

export const IMPORT_SPECS: ImportEntitySpec[] = [
  {
    code: 'DOCTORS', slug: 'doctores', step: 1, title: 'Doctores',
    summary: 'Odontólogos de la clínica (para la agenda, las historias y los presupuestos).',
    dependsOn: null,
    matchBy: 'código; si no hay código, N° de COP; luego correo; luego nombre completo',
    columns: [
      { key: 'codigo', description: 'Código del doctor en tu sistema anterior (recomendado: así se reconocen al volver a cargar).', format: 'Hasta 30 caracteres' },
      { key: 'nombres', required: true, description: 'Nombres del doctor.' },
      { key: 'apellidos', required: true, description: 'Apellidos del doctor.' },
      { key: 'cop', description: 'N° de colegiatura (COP).' },
      { key: 'especialidad', description: 'Especialidad (nombre o código del catálogo).', format: 'Ver hoja «Valores»' },
      { key: 'correo', description: 'Correo electrónico.' },
      { key: 'telefono', description: 'Teléfono o celular.' },
      { key: 'fecha_nacimiento', description: 'Fecha de nacimiento (para saludos de cumpleaños).', format: DATE },
      { key: 'color_agenda', description: 'Color en la agenda.', format: 'Hexadecimal, p. ej. #0E7490' },
      { key: 'activo', description: 'Si el doctor está activo (vacío = SI).', format: YESNO },
    ],
    examples: [
      { codigo: 'DR01', nombres: 'Carla', apellidos: 'Quispe Mamani', cop: '23456', especialidad: 'Ortodoncia', correo: 'carla.quispe@ejemplo.pe', telefono: '987 654 321', fecha_nacimiento: '14/03/1986', color_agenda: '#7C3AED', activo: 'SI' },
      { codigo: 'DR02', nombres: 'Jorge Luis', apellidos: 'Huamán Torres', cop: '31877', especialidad: 'Odontología general', correo: 'jorge.huaman@ejemplo.pe', telefono: '956 112 233', fecha_nacimiento: '02/11/1979', color_agenda: '#0E7490', activo: 'SI' },
    ],
  },
  {
    code: 'AGREEMENTS', slug: 'convenios', step: 2, title: 'Convenios',
    summary: 'Acuerdos con empresas o clubes y su % de descuento.',
    dependsOn: null,
    matchBy: 'código del convenio',
    columns: [
      { key: 'codigo', required: true, description: 'Código único del convenio.', format: 'Hasta 30 caracteres' },
      { key: 'nombre', required: true, description: 'Nombre del convenio (el que verá el paciente).' },
      { key: 'empresa', description: 'Empresa o club.' },
      { key: 'descuento_pct', required: true, description: 'Porcentaje de descuento.', format: 'Número de 0 a 100' },
      { key: 'vigencia_desde', description: 'Inicio de vigencia.', format: DATE },
      { key: 'vigencia_hasta', description: 'Fin de vigencia.', format: DATE },
      { key: 'exige_n_socio', description: 'Si exige el N° de socio o carnet del paciente (vacío = NO).', format: YESNO },
      { key: 'notas', description: 'Observaciones.' },
      { key: 'activo', description: 'Vacío = SI.', format: YESNO },
    ],
    examples: [
      { codigo: 'CLUBREG', nombre: 'Club Regatas Lima', empresa: 'Club de Regatas Lima', descuento_pct: '15', vigencia_desde: '01/01/2026', vigencia_hasta: '31/12/2026', exige_n_socio: 'SI', notas: 'Presentar carnet vigente', activo: 'SI' },
      { codigo: 'MINERA01', nombre: 'Minera Andina - Colaboradores', empresa: 'Minera Andina S.A.C.', descuento_pct: '10', vigencia_desde: '', vigencia_hasta: '', exige_n_socio: 'NO', notas: '', activo: 'SI' },
    ],
  },
  {
    code: 'SERVICES', slug: 'servicios', step: 3, title: 'Lista de precios',
    summary: 'Servicios / tratamientos con su categoría y precio base.',
    dependsOn: null,
    matchBy: 'código del servicio',
    columns: [
      { key: 'codigo', required: true, description: 'Código único del servicio.', format: 'Hasta 20 caracteres' },
      { key: 'nombre', required: true, description: 'Nombre del servicio o tratamiento.' },
      { key: 'categoria', description: 'Categoría (nombre o código). Si no existe, se crea.', format: 'Ver hoja «Valores»' },
      { key: 'precio_base', required: true, description: 'Precio base (se usa si el tarifario del paciente no tiene precio propio).', format: 'Número, p. ej. 150.00' },
      { key: 'moneda', description: 'Moneda (vacío = la de la clínica).', format: 'PEN / USD' },
      { key: 'requiere_laboratorio', description: 'Vacío = NO.', format: YESNO },
      { key: 'por_pieza', description: 'Se cobra por pieza dental (vacío = SI).', format: YESNO },
      { key: 'activo', description: 'Vacío = SI.', format: YESNO },
    ],
    examples: [
      { codigo: 'EXA01', nombre: 'Examen clínico con odontograma', categoria: 'Diagnóstico', precio_base: '50.00', moneda: 'PEN', requiere_laboratorio: 'NO', por_pieza: 'NO', activo: 'SI' },
      { codigo: 'RES01', nombre: 'Restauración con resina simple', categoria: 'Operatoria', precio_base: '120.00', moneda: 'PEN', requiere_laboratorio: 'NO', por_pieza: 'SI', activo: 'SI' },
      { codigo: 'COR01', nombre: 'Corona de porcelana sobre metal', categoria: 'Rehabilitación', precio_base: '850.00', moneda: 'PEN', requiere_laboratorio: 'SI', por_pieza: 'SI', activo: 'SI' },
    ],
  },
  {
    code: 'PRICE_LIST_ITEMS', slug: 'tarifarios', step: 4, title: 'Precios por tarifario',
    summary: 'Precio especial de cada servicio en un tarifario (Particular, aseguradora, convenio…). Si el tarifario no existe, se crea.',
    dependsOn: 'Lista de precios',
    matchBy: 'código de tarifario + código de servicio',
    columns: [
      { key: 'codigo_tarifario', required: true, description: 'Código del tarifario.', format: 'Letras, números, guion; hasta 30' },
      { key: 'nombre_tarifario', required: 'cond', description: 'Nombre del tarifario. Obligatorio si el tarifario es nuevo.' },
      { key: 'grupo', description: 'Tipo de plan o grupo del tarifario (opcional).' },
      { key: 'codigo_servicio', required: true, description: 'Código del servicio (cargado en Lista de precios).' },
      { key: 'precio', required: true, description: 'Precio del servicio en este tarifario.', format: 'Número, p. ej. 99.90' },
    ],
    examples: [
      { codigo_tarifario: 'PACIFICO', nombre_tarifario: 'Pacífico Seguros', grupo: 'Aseguradoras', codigo_servicio: 'EXA01', precio: '40.00' },
      { codigo_tarifario: 'PACIFICO', nombre_tarifario: 'Pacífico Seguros', grupo: 'Aseguradoras', codigo_servicio: 'RES01', precio: '100.00' },
    ],
  },
  {
    code: 'PATIENTS', slug: 'pacientes', step: 5, title: 'Pacientes',
    summary: 'Datos básicos de los pacientes, con su N° de historia clínica anterior.',
    dependsOn: 'Convenios y tarifarios (si los usas)',
    matchBy: 'N° de documento; si no tiene documento, N° de historia clínica',
    columns: [
      { key: 'hc', description: 'N° de historia clínica del sistema anterior. Vacío = se asigna el correlativo de OdontoSis.', format: 'Hasta 20 caracteres' },
      { key: 'tipo_documento', description: 'Tipo de documento (vacío = DNI si hay número).', format: 'DNI / CE / PAS / RUC' },
      { key: 'numero_documento', description: 'N° de documento. Recomendado: identifica al paciente al volver a cargar.', format: 'DNI: 8 dígitos' },
      { key: 'nombres', required: true, description: 'Nombres.' },
      { key: 'apellido_paterno', required: true, description: 'Apellido paterno.' },
      { key: 'apellido_materno', description: 'Apellido materno.' },
      { key: 'fecha_nacimiento', description: 'Fecha de nacimiento. Si es menor de 18 años, el apoderado es obligatorio.', format: DATE },
      { key: 'sexo', description: 'Sexo.', format: 'F / M / X' },
      { key: 'celular', description: 'Celular.' },
      { key: 'telefono', description: 'Teléfono fijo.' },
      { key: 'correo', description: 'Correo electrónico.' },
      { key: 'direccion', description: 'Dirección.' },
      { key: 'distrito_ubigeo', description: 'Distrito: código de ubigeo INEI de 6 dígitos.', format: 'p. ej. 150131 (San Isidro)' },
      { key: 'aseguradora', description: 'Compañía de seguros (texto).' },
      { key: 'convenio', description: 'Convenio (código o nombre). Si el nombre no existe, se crea con 0 % de descuento.' },
      { key: 'n_socio', description: 'N° de socio o carnet del convenio.' },
      { key: 'tarifario', description: 'Código del tarifario del paciente.' },
      { key: 'titular_documento', description: 'Si es dependiente: N° de documento del titular (puede estar en el mismo archivo).' },
      { key: 'titular_parentesco', description: 'Parentesco con el titular.', format: 'Ver hoja «Valores»' },
      { key: 'apoderado_nombre', required: 'cond', description: 'Nombre completo del apoderado. Obligatorio para menores de edad.' },
      { key: 'apoderado_parentesco', required: 'cond', description: 'Parentesco del apoderado. Obligatorio si hay apoderado.', format: 'Madre, Padre, Tutor legal…' },
      { key: 'apoderado_tipo_documento', description: 'Tipo de documento del apoderado.', format: 'DNI / CE / PAS' },
      { key: 'apoderado_documento', description: 'N° de documento del apoderado.' },
      { key: 'apoderado_telefono', description: 'Teléfono del apoderado.' },
      { key: 'alergias', description: 'Alergias.' },
      { key: 'antecedentes', description: 'Antecedentes médicos.' },
      { key: 'notas', description: 'Observaciones.' },
      { key: 'activo', description: 'Vacío = SI.', format: YESNO },
    ],
    examples: [
      { hc: '001250', tipo_documento: 'DNI', numero_documento: '45871236', nombres: 'María Elena', apellido_paterno: 'Rojas', apellido_materno: 'Gutiérrez', fecha_nacimiento: '21/07/1988', sexo: 'F', celular: '987 123 456', telefono: '', correo: 'maria.rojas@ejemplo.pe', direccion: 'Av. Arequipa 1450, dpto. 302', distrito_ubigeo: '150122', aseguradora: 'Pacífico Seguros', convenio: '', n_socio: '', tarifario: 'PACIFICO', titular_documento: '', titular_parentesco: '', apoderado_nombre: '', apoderado_parentesco: '', apoderado_tipo_documento: '', apoderado_documento: '', apoderado_telefono: '', alergias: 'Penicilina', antecedentes: 'Hipertensión controlada', notas: '', activo: 'SI' },
      { hc: '001251', tipo_documento: 'DNI', numero_documento: '78451236', nombres: 'Mateo', apellido_paterno: 'Rojas', apellido_materno: 'Salazar', fecha_nacimiento: '05/02/2016', sexo: 'M', celular: '', telefono: '', correo: '', direccion: 'Av. Arequipa 1450, dpto. 302', distrito_ubigeo: '150122', aseguradora: '', convenio: '', n_socio: '', tarifario: '', titular_documento: '45871236', titular_parentesco: 'Hijo(a)', apoderado_nombre: 'María Elena Rojas Gutiérrez', apoderado_parentesco: 'Madre', apoderado_tipo_documento: 'DNI', apoderado_documento: '45871236', apoderado_telefono: '987 123 456', alergias: '', antecedentes: '', notas: 'Dependiente de su madre', activo: 'SI' },
      { hc: '001252', tipo_documento: 'CE', numero_documento: '001234567', nombres: 'Luis Alberto', apellido_paterno: 'Fernández', apellido_materno: '', fecha_nacimiento: '30/10/1975', sexo: 'M', celular: '912 345 678', telefono: '01 4405566', correo: '', direccion: 'Jr. Junín 455, Cercado', distrito_ubigeo: '150101', aseguradora: '', convenio: 'Club Regatas Lima', n_socio: 'RL-8891', tarifario: '', titular_documento: '', titular_parentesco: '', apoderado_nombre: '', apoderado_parentesco: '', apoderado_tipo_documento: '', apoderado_documento: '', apoderado_telefono: '', alergias: '', antecedentes: 'Diabetes tipo 2', notas: '', activo: 'SI' },
    ],
  },
  {
    code: 'CLINICAL_NOTES', slug: 'historias', step: 6, title: 'Historias clínicas',
    summary: 'Evoluciones / notas clínicas por fecha y antecedentes de cada paciente.',
    dependsOn: 'Pacientes y Doctores',
    matchBy: 'codigo_externo; si no hay, paciente + fecha + mismo texto de la nota',
    columns: [
      ...PATIENT_REF,
      { key: 'fecha', required: 'cond', description: 'Fecha de la atención o nota. Obligatoria si hay nota.', format: DATE },
      { key: 'doctor', description: DOCTOR_REF },
      { key: 'nota', required: 'cond', description: 'Evolución / nota clínica. Obligatoria salvo que la fila sólo traiga antecedentes o alergias.', format: 'Texto (hasta 20 000 caracteres)' },
      { key: 'antecedentes', description: 'Antecedentes médicos del paciente (reemplaza los de la ficha).' },
      { key: 'alergias', description: 'Alergias del paciente (reemplaza las de la ficha).' },
      { key: 'codigo_externo', description: 'Identificador de la nota en el sistema anterior (evita duplicados al re-importar).' },
    ],
    examples: [
      { paciente_documento: '45871236', paciente_hc: '', fecha: '12/05/2025', doctor: 'DR02', nota: 'Paciente acude por dolor en pieza 3.6. Se diagnostica caries profunda. Se indica radiografía periapical.', antecedentes: 'Hipertensión controlada', alergias: 'Penicilina', codigo_externo: 'EV-10021' },
      { paciente_documento: '45871236', paciente_hc: '', fecha: '20/05/2025', doctor: 'DR02', nota: 'Endodoncia pieza 3.6, primera sesión. Sin complicaciones.', antecedentes: '', alergias: '', codigo_externo: 'EV-10022' },
      { paciente_documento: '', paciente_hc: '001252', fecha: '03/06/2025', doctor: 'Carla Quispe Mamani', nota: 'Control de ortodoncia. Cambio de arco 0.016 NiTi.', antecedentes: '', alergias: '', codigo_externo: '' },
    ],
  },
  {
    code: 'APPOINTMENTS', slug: 'citas', step: 7, title: 'Citas',
    summary: 'Citas pasadas (historial) y futuras de la agenda.',
    dependsOn: 'Pacientes y Doctores',
    matchBy: 'codigo_externo; si no hay, paciente + doctor + fecha y hora',
    columns: [
      { key: 'codigo_externo', description: 'Identificador de la cita en el sistema anterior (recomendado).' },
      ...PATIENT_REF,
      { key: 'doctor', required: true, description: DOCTOR_REF },
      { key: 'fecha', required: true, description: 'Fecha de la cita.', format: DATE },
      { key: 'hora_inicio', required: true, description: 'Hora de inicio (hora local de la clínica).', format: 'HH:MM en 24 h, p. ej. 15:30' },
      { key: 'duracion_min', description: 'Duración en minutos (vacío = 30).', format: 'Número entre 5 y 600' },
      { key: 'estado', description: 'Vacío = Atendida si ya pasó, Programada si es futura.', format: 'Programada, Confirmada, Atendida, Cancelada, No asistió' },
      { key: 'motivo', description: 'Motivo de la cita.' },
      { key: 'notas', description: 'Notas.' },
      { key: 'sede', description: 'Código o nombre de la sede (vacío = sede principal).' },
    ],
    examples: [
      { codigo_externo: 'CITA-5501', paciente_documento: '45871236', paciente_hc: '', doctor: 'DR02', fecha: '12/05/2025', hora_inicio: '09:00', duracion_min: '45', estado: 'Atendida', motivo: 'Dolor pieza 3.6', notas: '', sede: '' },
      { codigo_externo: 'CITA-5502', paciente_documento: '', paciente_hc: '001252', doctor: '23456', fecha: '15/12/2026', hora_inicio: '16:30', duracion_min: '30', estado: 'Programada', motivo: 'Control de ortodoncia', notas: 'Traer radiografía', sede: '' },
    ],
  },
  {
    code: 'BUDGETS', slug: 'presupuestos', step: 8, title: 'Presupuestos',
    summary: 'Presupuestos con sus tratamientos: una fila por tratamiento; las filas con el mismo codigo_externo forman un presupuesto.',
    dependsOn: 'Pacientes, Doctores, Lista de precios y tarifarios',
    matchBy: 'codigo_externo (se reemplazan sus tratamientos)',
    columns: [
      { key: 'codigo_externo', required: true, description: 'Identificador del presupuesto. Repite el mismo código en cada tratamiento del presupuesto.' },
      ...PATIENT_REF,
      { key: 'fecha', required: true, description: 'Fecha del presupuesto.', format: DATE },
      { key: 'doctor', description: DOCTOR_REF },
      { key: 'estado', description: 'Vacío = Borrador.', format: 'Borrador, Entregado, Aprobado, Rechazado, Vencido' },
      { key: 'tarifario', description: 'Código del tarifario (vacío = el del paciente).' },
      { key: 'descuento', description: 'Descuento en monto para todo el presupuesto (se toma de la primera fila).', format: 'Número' },
      { key: 'notas', description: 'Notas del presupuesto (se toma de la primera fila).' },
      { key: 'codigo_servicio', required: 'cond', description: 'Código del servicio. Si lo dejas vacío, indica descripción y precio_unitario.' },
      { key: 'descripcion', description: 'Descripción del tratamiento (vacío = nombre del servicio).' },
      { key: 'pieza', description: 'Pieza dental FDI (vacío = tratamiento general).', format: '1.6 o 16; de 1.1 a 8.5' },
      { key: 'superficies', description: 'Superficies tratadas.', format: 'Letras O, V, L, M, D (p. ej. OM)' },
      { key: 'cantidad', description: 'Vacío = 1.', format: 'Número' },
      { key: 'precio_unitario', description: 'Vacío = precio del tarifario o precio base del servicio.', format: 'Número' },
    ],
    examples: [
      { codigo_externo: 'PRE-2025-0101', paciente_documento: '45871236', paciente_hc: '', fecha: '12/05/2025', doctor: 'DR02', estado: 'Aprobado', tarifario: '', descuento: '20', notas: 'Tratamiento en 3 sesiones', codigo_servicio: 'EXA01', descripcion: '', pieza: '', superficies: '', cantidad: '1', precio_unitario: '' },
      { codigo_externo: 'PRE-2025-0101', paciente_documento: '45871236', paciente_hc: '', fecha: '12/05/2025', doctor: 'DR02', estado: 'Aprobado', tarifario: '', descuento: '', notas: '', codigo_servicio: 'RES01', descripcion: '', pieza: '3.6', superficies: 'OD', cantidad: '1', precio_unitario: '120.00' },
      { codigo_externo: 'PRE-2025-0102', paciente_documento: '', paciente_hc: '001252', fecha: '03/06/2025', doctor: 'DR01', estado: 'Borrador', tarifario: '', descuento: '', notas: '', codigo_servicio: 'COR01', descripcion: '', pieza: '11', superficies: '', cantidad: '1', precio_unitario: '' },
    ],
  },
];

export const specByCode = (code: string) => IMPORT_SPECS.find((s) => s.code === code) ?? null;
export const specBySlug = (slug: string) => IMPORT_SPECS.find((s) => s.slug === slug) ?? null;

export type ImportIssue = { row: number | null; column: string | null; message: string };

export type ImportResult = {
  entity: ImportEntity;
  mode: 'validate' | 'import';
  fileName: string;
  totalRows: number;
  okRows: number;
  errorRows: number;
  /** Registros (no filas) nuevos y existentes que se actualizan */
  createCount: number;
  updateCount: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  durationMs: number;
  batchId?: string;
  status?: 'COMPLETED' | 'PARTIAL' | 'FAILED';
};

export type ImportBatchRow = {
  id: string; entity_code: ImportEntity; entity_name: string; status_code: string; status_name: string; status_color: string | null;
  file_name: string; total_rows: number; ok_rows: number; error_rows: number; created_rows: number; updated_rows: number;
  duration_ms: number | null; created_at: string; finished_at: string | null; created_by_name: string | null; by_platform: number | boolean;
};
