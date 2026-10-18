/** Errores de negocio. Los SP señalan 'APP:<CODIGO>' y aquí se traducen a mensaje + HTTP status. */
const MESSAGES: Record<string, [number, string]> = {
  NOT_FOUND: [404, 'Registro no encontrado.'],
  FORBIDDEN: [403, 'No tienes permiso para esta acción.'],
  UNAUTHORIZED: [401, 'Tu sesión expiró. Vuelve a iniciar sesión.'],
  VALIDATION: [400, 'Revisa los datos ingresados.'],
  RATE_LIMITED: [429, 'Demasiados intentos. Espera unos minutos.'],
  INVALID_CREDENTIALS: [401, 'Correo o contraseña incorrectos.'],
  ACCOUNT_LOCKED: [423, 'Cuenta bloqueada temporalmente por intentos fallidos.'],
  TENANT_INACTIVE: [403, 'La clínica está suspendida. Contacta al administrador de la plataforma.'],
  INVALID_MFA: [401, 'Código de verificación inválido.'],
  WEAK_PASSWORD: [400, 'La contraseña no cumple la política de seguridad.'],
  INVALID_FILE: [400, 'Archivo no permitido. Usa PNG, JPG o WEBP de hasta 2 MB.'],
  MASTER_ITEM_NOT_FOUND: [400, 'Valor de catálogo no encontrado.'],
  INVALID_CATALOG_VALUE: [400, 'Valor de catálogo inválido.'],
  CATALOG_NOT_EDITABLE: [403, 'Este catálogo no es editable.'],
  CODE_TAKEN: [409, 'El código ya existe.'],
  PLAN_CODE_TAKEN: [409, 'El código de plan ya existe.'],
  PLAN_NOT_FOUND: [400, 'Plan no encontrado o inactivo.'],
  INVALID_MAX_USERS: [400, 'El plan debe permitir al menos 1 usuario.'],
  TENANT_CODE_TAKEN: [409, 'El código de la clínica ya está en uso.'],
  EMAIL_TAKEN: [409, 'El correo ya está registrado.'],
  PLAN_USER_LIMIT: [409, 'Se alcanzó el máximo de usuarios activos del plan.'],
  PLAN_PATIENT_LIMIT: [409, 'Se alcanzó el máximo de pacientes del plan.'],
  PLAN_STORAGE_LIMIT: [409, 'Se alcanzó el almacenamiento máximo del plan.'],
  ROLE_NOT_FOUND: [400, 'Rol no válido.'],
  CANNOT_DISABLE_SELF: [400, 'No puedes desactivar tu propio usuario.'],
  CANNOT_DELETE_SELF: [400, 'No puedes eliminar tu propio usuario.'],
  USER_NOT_FOUND: [400, 'Usuario no encontrado.'],
  USER_ALREADY_LINKED: [409, 'Ese usuario ya está vinculado a otro doctor.'],
  PATIENT_DOC_TAKEN: [409, 'Ya existe un paciente con ese documento.'],
  PATIENT_NOT_FOUND: [400, 'Paciente no encontrado.'],
  DOCTOR_NOT_FOUND: [400, 'Doctor no encontrado.'],
  SERVICE_NOT_FOUND: [400, 'Servicio no encontrado.'],
  BUDGET_EMPTY: [400, 'El presupuesto debe tener al menos un tratamiento.'],
  INVALID_PRICE: [400, 'El precio no puede ser negativo.'],
  INVALID_RANGE: [400, 'La hora de fin debe ser posterior a la de inicio.'],
  INVALID_PERIOD: [400, 'El fin del periodo debe ser posterior al inicio.'],
  APPOINTMENT_OVERLAP: [409, 'El doctor ya tiene una cita en ese horario.'],
  FILE_NOT_FOUND: [400, 'Archivo no encontrado.'],
  INVALID_DISCOUNT: [400, 'El descuento debe estar entre 0 % y 100 %.'],
  AGREEMENT_IN_USE: [409, 'El convenio tiene pacientes asociados. Desactívalo en lugar de eliminarlo.'],
  AGREEMENT_NOT_VALID: [400, 'El convenio no está activo o no está vigente para la fecha del presupuesto.'],
  AGREEMENT_MEMBER_CODE_REQUIRED: [400, 'Este convenio exige el N° de socio o carnet del paciente.'],
  BUDGET_EDIT_FORBIDDEN: [403, 'No tienes permiso para modificar presupuestos ya emitidos. Solicítalo al administrador de la clínica.'],
  CONTRACT_REQUIRED: [400, 'Para pasar a producción (Activo) la clínica debe tener al menos un contrato cargado.'],
  CONTRACT_FILE_REQUIRED: [400, 'Adjunta el contrato firmado (PDF o imagen).'],
  CONTRACT_OVERLAP: [409, 'Las fechas se cruzan con otro contrato de la clínica.'],
  IMPLEMENTATION_DATES_REQUIRED: [400, 'Indica el inicio y fin del periodo de implementación.'],
  IMPLEMENTATION_PATIENT_LIMIT: [409, 'Se alcanzó el máximo de pacientes permitido durante la implementación.'],
  NOT_IN_IMPLEMENTATION: [400, 'Sólo se puede ampliar la implementación de una clínica en estado Implementación.'],
  EXTENSION_DATE_INVALID: [400, 'La nueva fecha de fin debe ser posterior a la actual.'],
  EXTENSION_REASON_REQUIRED: [400, 'Indica el motivo de la ampliación.'],
  GUARDIAN_SAME_AS_PATIENT: [400, 'El apoderado no puede ser el mismo paciente.'],
  PLAN_BRANCH_LIMIT: [409, 'Tu plan no permite más sedes activas. Solicita una ampliación del plan.'],
  BRANCH_MAIN_REQUIRED: [400, 'La sede principal no se puede desactivar ni eliminar. Marca otra sede como principal primero.'],
  BRANCH_NOT_FOUND: [400, 'Sede no encontrada o inactiva.'],
  INVALID_MAX_BRANCHES: [400, 'El plan debe permitir al menos 1 sede.'],
  PRICE_LIST_NOT_FOUND: [400, 'Tarifario no encontrado.'],
  PRICE_LIST_DEFAULT_REQUIRED: [400, 'El tarifario por defecto no se puede desactivar ni eliminar. Marca otro como predeterminado primero.'],
  PRICE_LIST_IN_USE: [409, 'El tarifario está asignado a pacientes. Desactívalo en lugar de eliminarlo.'],
  TITULAR_SAME_AS_PATIENT: [400, 'El titular no puede ser el mismo paciente.'],
  TITULAR_CYCLE: [400, 'Ese paciente ya es dependiente de este paciente.'],
  INVALID_BIRTH_DATE: [400, 'Fecha de nacimiento inválida.'],
  DNI_LOOKUP_DISABLED: [503, 'La consulta de DNI no está configurada. Ingresa los datos manualmente.'],
  DNI_NOT_FOUND: [404, 'No se encontraron datos para ese DNI.'],
  DNI_LOOKUP_FAILED: [502, 'No se pudo consultar el DNI en este momento. Ingresa los datos manualmente.'],
  REFERRAL_TARGET_REQUIRED: [400, 'Indica el especialista o clínica de destino, o el doctor de la clínica si la derivación es interna.'],
  BUDGET_NOT_FOUND: [400, 'Presupuesto no encontrado o no pertenece al paciente.'],
  GUARANTEE_DATES_INVALID: [400, 'La fecha de respuesta no puede ser anterior a la fecha de solicitud.'],
  ORTHO_INITIAL_EXCEEDS_TOTAL: [400, 'La cuota inicial no puede superar el total del tratamiento (con el descuento del convenio).'],
  ORTHO_INVALID_INSTALLMENTS: [400, 'El número de cuotas debe estar entre 1 y 120.'],
  GUARDIAN_REQUIRED: [400, 'El paciente es menor de edad o requiere apoderado: ingresa el nombre y parentesco del apoderado.'],
  PAYMENT_DOCS_REQUIRED: [400, 'Para un pago “Pagado” adjunta la factura emitida (con su número) y el comprobante o evidencia de pago.'],
};

export class AppError extends Error {
  constructor(public code: string, public status = MESSAGES[code]?.[0] ?? 500, message?: string, public details?: unknown) {
    super(message ?? MESSAGES[code]?.[1] ?? 'Ocurrió un error inesperado.');
  }

  static fromDb(err: unknown): Error {
    const e = err as { sqlState?: string; sqlMessage?: string };
    if (e?.sqlState === '45000' && e.sqlMessage?.startsWith('APP:')) {
      return new AppError(e.sqlMessage.slice(4));
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}
