import type { TourStep } from './tour';

const K = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg">{children}</kbd>
);
const S = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>;

/** Guía del editor de presupuestos (crear o editar) */
export const BUDGET_EDITOR_TOUR: TourStep[] = [
  {
    title: 'Crear un presupuesto en 4 pasos',
    body: (
      <>
        <p>Te mostramos cada parte de esta pantalla. Los números <S>①②③④</S> que ves en los títulos indican el orden.</p>
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>Elegir al paciente y los datos.</li>
          <li>Marcar la pieza en el odontograma y elegir el tratamiento.</li>
          <li>Revisar la lista de tratamientos y el total.</li>
          <li>Guardar.</li>
        </ol>
        <p>Puedes volver a ver esta guía con el botón <S>¿Cómo se hace?</S></p>
      </>
    ),
  },
  {
    target: 'patient',
    title: '① Busca al paciente',
    body: (
      <>
        <p>Escribe parte del <S>nombre, apellido o N° de historia clínica (H.C.)</S> y elígelo de la lista.</p>
        <p>Al elegirlo se cargan solos su <S>seguro</S>, su <S>convenio</S> y su <S>tarifario</S>, si los tiene en la ficha.</p>
        <p>¿Es un paciente nuevo? Primero regístralo en <S>Pacientes → Nuevo paciente</S>.</p>
      </>
    ),
  },
  {
    target: 'doctor',
    title: 'Doctor tratante y fecha',
    body: <p>Elige al doctor que realizará el tratamiento. La fecha es hoy por defecto; la vigencia del presupuesto se calcula desde esa fecha.</p>,
  },
  {
    target: 'insurance',
    title: '¿Tiene seguro?',
    body: (
      <>
        <p>Si el paciente es <S>particular</S>, deja este campo vacío.</p>
        <p>Si tiene seguro, escribe la compañía e indica el <S>deducible por pieza</S> y el <S>coaseguro %</S>: el sistema calcula cuánto paga el paciente en cada tratamiento.</p>
      </>
    ),
  },
  {
    target: 'agreement',
    title: 'Convenio (descuento)',
    body: <p>Si el paciente pertenece a una empresa o club con convenio, elígelo aquí: el descuento se aplica automáticamente a todos los tratamientos y se muestra el ahorro.</p>,
  },
  {
    target: 'odontogram',
    title: '② Marca la pieza en el odontograma',
    body: (
      <>
        <p>Haz clic en el <S>número de la pieza</S> para elegirla completa, o en sus <S>superficies</S> para elegir sólo esas:</p>
        <p><S>O</S> oclusal · <S>V</S> vestibular · <S>L</S> lingual/palatino · <S>M</S> mesial · <S>D</S> distal</p>
        <p>Puedes marcar varias superficies de la misma pieza antes de agregar el tratamiento.</p>
      </>
    ),
  },
  {
    target: 'palette',
    title: 'Hallazgos (opcional)',
    body: (
      <>
        <p>Para registrar lo que ves en boca (caries, restauraciones, ausentes…), elige el hallazgo y haz clic en la pieza o superficie.</p>
        <p>Para volver a agregar tratamientos, elige <S>Seleccionar pieza</S>.</p>
      </>
    ),
  },
  {
    target: 'service',
    title: 'Elige el tratamiento',
    body: <p>Escribe parte del nombre o del código (por ejemplo <K>resina</K> o <K>ENDO</K>). El precio sale del tarifario del paciente; si no tiene, de la lista de precios general.</p>,
  },
  {
    target: 'add-buttons',
    title: 'Agrégalo',
    body: (
      <>
        <p><S>Agregar a pieza</S>: lo suma a la pieza y superficies que marcaste.</p>
        <p><S>General</S>: para tratamientos que no son de una pieza (profilaxis, radiografías, blanqueamiento…).</p>
        <p>Repite ② por cada tratamiento.</p>
      </>
    ),
  },
  {
    target: 'items',
    title: '③ Revisa los tratamientos',
    body: <p>Aquí aparece cada tratamiento agregado. Puedes cambiar la <S>cantidad</S> o el <S>precio</S>, o quitarlo con el tacho. Las piezas con tratamiento se resaltan en el odontograma.</p>,
  },
  {
    target: 'totals',
    title: 'Total a cancelar',
    body: (
      <>
        <p>Particular: total de tratamientos menos el <S>descuento</S> que escribas (monto, no porcentaje).</p>
        <p>Con seguro: el paciente paga la suma de deducibles y coaseguros.</p>
        <p>Si hay convenio, se muestra el ahorro en verde.</p>
      </>
    ),
  },
  {
    target: 'save',
    title: '④ Guarda',
    body: (
      <>
        <p>Pulsa <S>Guardar presupuesto</S>. Se le asigna un número y podrás <S>imprimirlo o descargarlo en PDF</S> para entregarlo al paciente.</p>
        <p>¿Sin internet? Igual se guarda y se envía solo cuando vuelva la conexión.</p>
      </>
    ),
  },
];

/** Guía de la pantalla de un presupuesto ya guardado */
export const BUDGET_DETAIL_TOUR: TourStep[] = [
  {
    target: 'budget-status',
    title: 'Estado del presupuesto',
    body: (
      <>
        <p><S>Borrador</S> → <S>Entregado</S> cuando se lo das al paciente → <S>Aprobado</S> si acepta o <S>Rechazado</S> si no. Si pasa la fecha de vigencia, márcalo <S>Vencido</S>.</p>
        <p>Con esto el Inicio te muestra cuánto se aprobó en el mes.</p>
      </>
    ),
  },
  {
    target: 'budget-print',
    title: 'Imprimir o PDF',
    body: <p>Abre la impresión. Para enviarlo por WhatsApp o correo, elige <S>Guardar como PDF</S> como impresora.</p>,
  },
  {
    target: 'budget-edit',
    title: 'Editar',
    body: <p>Para corregir tratamientos, precios o datos. Si no ves este botón, pide a tu administrador el permiso para editar presupuestos.</p>,
  },
  {
    target: 'budget-document',
    title: 'Así lo verá el paciente',
    body: <p>Este es el documento que se imprime: datos del paciente, odontograma y el detalle de tratamientos con el total.</p>,
  },
];

/** Guía del listado */
export const BUDGET_LIST_TOUR: TourStep[] = [
  {
    target: 'new-budget',
    title: 'Nuevo presupuesto',
    body: <p>Empieza aquí. También puedes crearlo desde la ficha del paciente, y entonces ya viene con el paciente elegido.</p>,
  },
  {
    target: 'budget-list',
    title: 'Tus presupuestos',
    body: <p>Busca por paciente o número y filtra por estado. Haz clic en uno para verlo, imprimirlo o cambiar su estado.</p>,
  },
];
