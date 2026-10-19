import { formatDate } from '@/lib/shared/format';

/**
 * Textos de los formatos de consentimiento (Perú). Versión: CONSENT_FORM_VERSION en schemas.ts — al cambiar
 * el texto, subir la versión para que cada firma quede asociada al texto que el paciente leyó.
 * Formatos REFERENCIALES: cada clínica debe validarlos con su asesor legal antes de usarlos.
 */
export type ConsentClinic = { trade_name: string; legal_name: string | null; tax_id: string | null; address: string | null; phone: string | null; email: string | null };
export type ConsentPerson = {
  patientName: string; patientDoc: string | null; recordNumber: string | null;
  /** Si firma el apoderado (menor de edad o paciente que requiere apoderado) */
  guardian: { name: string | null; doc: string | null; relationship: string | null } | null;
};

const Blank = ({ w = 'w-48', v }: { w?: string; v?: string | null }) =>
  v ? <strong className="font-semibold">{v}</strong> : <span className={`inline-block ${w} border-b border-fg/60 align-bottom`}>&nbsp;</span>;
const Box = () => <span className="mr-1.5 inline-block size-3.5 border border-fg/70 align-middle" aria-hidden />;

function Declarant({ p }: { p: ConsentPerson }) {
  return p.guardian ? (
    <>Yo, <Blank v={p.guardian.name} w="w-64" />, identificado(a) con documento N° <Blank v={p.guardian.doc} w="w-32" />, en mi calidad
      de <Blank v={p.guardian.relationship?.toLowerCase() ?? null} w="w-32" /> y representante del paciente <strong>{p.patientName}</strong>
      {p.patientDoc ? <>, identificado(a) con documento N° <strong>{p.patientDoc}</strong></> : null}</>
  ) : (
    <>Yo, <strong>{p.patientName}</strong>, identificado(a) con documento N° <Blank v={p.patientDoc} w="w-32" /></>
  );
}

function Signature({ p, city }: { p: ConsentPerson; city?: string | null }) {
  const who = p.guardian ? 'Firma del padre, madre, tutor o apoderado' : 'Firma del paciente';
  return (
    <section className="mt-6 break-inside-avoid">
      <p>Lugar y fecha: <Blank w="w-40" v={city ?? null} />, <Blank w="w-40" /></p>
      <div className="mt-10 grid grid-cols-[1fr_auto] items-end gap-8">
        <div className="space-y-1 text-xs">
          <div className="w-72 border-t border-fg/70 pt-1">{who}</div>
          <p>Nombre: {p.guardian ? <Blank v={p.guardian.name} w="w-56" /> : <strong>{p.patientName}</strong>}</p>
          <p>Documento N°: <Blank v={p.guardian ? p.guardian.doc : p.patientDoc} w="w-36" /></p>
        </div>
        <div className="grid size-24 place-items-end justify-center border border-fg/60 pb-1 text-[10px] text-muted">Huella digital</div>
      </div>
    </section>
  );
}

function ClinicLine({ c }: { c: ConsentClinic }) {
  return <><strong>{c.legal_name || c.trade_name}</strong>{c.tax_id ? <>, con RUC N° <strong>{c.tax_id}</strong></> : null}, con domicilio en <Blank v={c.address} w="w-64" /></>;
}

/** Consentimiento para el tratamiento de datos personales (incluye datos sensibles de salud) */
export function DataProtectionConsent({ c, p, version, city }: { c: ConsentClinic; p: ConsentPerson; version: string; city?: string | null }) {
  return (
    <article className="consent-page space-y-2.5 text-[12px] leading-relaxed print:text-[11.5px] print:leading-snug">
      <h1 className="text-center text-sm font-bold uppercase tracking-wide">Consentimiento para el tratamiento de datos personales</h1>
      <p className="text-center text-xs text-muted">Ley N° 29733, Ley de Protección de Datos Personales, y su Reglamento</p>
      <p><Declarant p={p} />, declaro haber sido informado(a) de forma previa, expresa e inequívoca sobre lo siguiente y, en consecuencia,
        <strong> otorgo mi consentimiento libre, previo, expreso, informado e inequívoco</strong> para el tratamiento de los datos personales indicados:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li><strong>Responsable del tratamiento:</strong> <ClinicLine c={c} />, titular del banco de datos de pacientes{c.email ? <> (correo de contacto: <strong>{c.email}</strong>)</> : null}.</li>
        <li><strong>Datos que se tratarán:</strong> de identificación y contacto, y <strong>datos de salud</strong> (antecedentes, alergias, diagnósticos, odontograma, fotografías y radiografías, tratamientos, presupuestos y pagos), que la ley califica como <strong>datos sensibles</strong>.</li>
        <li><strong>Finalidades:</strong> brindar la atención odontológica; elaborar, custodiar y conservar la historia clínica; gestionar citas, presupuestos y cobros; coordinar con la compañía de seguros o la entidad con convenio que yo indique; y cumplir las obligaciones legales y sanitarias.</li>
        <li><strong>Destinatarios:</strong> los profesionales y el personal autorizado de la clínica; los proveedores tecnológicos que prestan el sistema de gestión y el almacenamiento de la información, como encargados del tratamiento y con deber de confidencialidad; la aseguradora o entidad con convenio que yo indique; y las autoridades, cuando la ley lo exija. Los datos pueden alojarse en servidores ubicados fuera del Perú, con medidas de seguridad adecuadas.</li>
        <li><strong>Conservación:</strong> durante el plazo que exige la normativa sanitaria para la historia clínica; vencido ese plazo, serán eliminados o anonimizados.</li>
        <li><strong>Seguridad:</strong> la clínica aplica medidas técnicas y organizativas (acceso restringido por usuario, cifrado de datos sensibles y registro de accesos) para evitar su alteración, pérdida o acceso no autorizado.</li>
        <li><strong>Carácter de los datos:</strong> los datos de identificación y de salud son necesarios para la atención; negarse a proporcionarlos puede impedir la prestación del servicio, salvo en casos de urgencia.</li>
        <li><strong>Derechos:</strong> puedo ejercer en cualquier momento mis derechos de <strong>acceso, rectificación, cancelación y oposición</strong>, y revocar este consentimiento sin efecto retroactivo, mediante solicitud dirigida a {c.email ? <strong>{c.email}</strong> : 'la clínica'} o en su domicilio. Si no fuera atendido(a), puedo acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y Derechos Humanos.</li>
      </ol>
      <div className="rounded border border-fg/40 p-3">
        <p className="font-semibold">Autorización opcional para comunicaciones</p>
        <p className="mt-1"><Box />SÍ autorizo &nbsp;&nbsp; <Box />NO autorizo &nbsp;el uso de mis datos de contacto para recibir información sobre campañas, promociones, recordatorios preventivos y saludos (por ejemplo, por mi cumpleaños) por WhatsApp, SMS, correo electrónico o llamada. Esta autorización es independiente y <strong>no condiciona la atención</strong>.</p>
      </div>
      <Signature p={p} city={city} />
      <p className="text-[10px] text-muted">Formato v{version}{p.recordNumber ? ` · H.C. ${p.recordNumber}` : ''}</p>
    </article>
  );
}

/** Consentimiento sobre la confidencialidad (secreto profesional) de la información clínica */
export function MedicalConfidentialityConsent({ c, p, version, city }: { c: ConsentClinic; p: ConsentPerson; version: string; city?: string | null }) {
  return (
    <article className="consent-page space-y-2.5 text-[12px] leading-relaxed print:text-[11.5px] print:leading-snug">
      <h1 className="text-center text-sm font-bold uppercase tracking-wide">Consentimiento informado sobre la confidencialidad de la información clínica</h1>
      <p className="text-center text-xs text-muted">Ley N° 26842, Ley General de Salud · Ley N° 29414, derechos de las personas usuarias de los servicios de salud</p>
      <p><Declarant p={p} />, declaro que <ClinicLine c={c} />, me ha informado que:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Toda la información relacionada con mi atención —consultas, diagnósticos, tratamientos, imágenes y la historia clínica— es <strong>reservada</strong>, y los profesionales y el personal de la clínica están obligados a guardar el <strong>secreto profesional</strong>, incluso después de concluida la atención.</li>
        <li>Solo accederán a ella los profesionales que intervienen en mi atención y el personal autorizado, en la medida necesaria para sus funciones, y cada acceso queda registrado en el sistema.</li>
        <li>Mi información no será revelada a terceros sin mi autorización, salvo en los casos que la ley permite expresamente (por ejemplo, por mandato judicial o por razones de salud pública), conforme al artículo 25 de la Ley General de Salud.</li>
        <li>Tengo derecho a acceder a mi historia clínica y a solicitar una copia, conforme a la normativa vigente.</li>
      </ol>
      <div className="space-y-1.5 rounded border border-fg/40 p-3">
        <p className="font-semibold">Autorizo que la clínica comparta la información estrictamente necesaria con:</p>
        <p><Box />La compañía de seguros, EPS o entidad con convenio que yo indique, para gestionar la cobertura de mi tratamiento.</p>
        <p><Box />El profesional o establecimiento al que se me derive o con quien se realice una interconsulta.</p>
        <p><Box />La siguiente persona, para recibir información sobre mi tratamiento: <Blank w="w-56" /> (parentesco: <Blank w="w-24" />).</p>
        <p className="pt-1"><Box />SÍ <Box />NO autorizo el uso de mis fotografías y radiografías clínicas, <strong>sin datos que me identifiquen</strong>, con fines académicos o de difusión profesional.</p>
      </div>
      <p>Declaro haber leído y comprendido este documento, haber podido hacer preguntas y que mis dudas fueron absueltas.</p>
      <Signature p={p} city={city} />
      <p className="text-[10px] text-muted">Formato v{version}{p.recordNumber ? ` · H.C. ${p.recordNumber}` : ''}</p>
    </article>
  );
}

export const CONSENT_LABELS: Record<string, { title: string; law: string }> = {
  DATA_PROTECTION: { title: 'Tratamiento de datos personales', law: 'Ley N° 29733' },
  MEDICAL_CONFIDENTIALITY: { title: 'Confidencialidad de la información clínica', law: 'Ley N° 26842' },
};

export const consentDate = (d: string | null | undefined) => (d ? formatDate(d.slice(0, 10)) : '—');
