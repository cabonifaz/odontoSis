'use client';
import Link from 'next/link';
import { ArrowLeft, PlayCircle, Printer } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { Callouts, Shot, Tip } from '@/components/help/figure';

const IMG = '/help/presupuestos';

const SECTIONS = [
  ['antes', 'Antes de empezar'],
  ['paso-1', 'Paso 1 · Paciente y datos'],
  ['paso-2', 'Paso 2 · Odontograma y tratamientos'],
  ['paso-3', 'Paso 3 · Revisar el total'],
  ['paso-4', 'Paso 4 · Guardar'],
  ['despues', 'Después de guardar'],
  ['ejemplos', 'Ejemplos: particular, seguro y convenio'],
  ['celular', 'Desde el celular'],
  ['preguntas', 'Preguntas frecuentes'],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 scroll-mt-24 border-t border-line pt-8 text-xl font-semibold tracking-tight first:mt-0 first:border-0 first:pt-0">{children}</h2>;
}

/** Manual ilustrado: cómo crear un presupuesto (capturas reales generadas con scripts/help/capture-budget-manual.mjs) */
export default function BudgetManualPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/app/help" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" /> Ayuda</Link>

      <header className="mb-8 rounded-card border border-line bg-surface p-6 sm:p-8">
        <p className="text-sm font-medium text-brand">Manual · 5 minutos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Cómo crear un presupuesto</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Un presupuesto se arma en <strong className="text-fg">4 pasos</strong>, y la pantalla los muestra numerados ① ② ③ ④ para que no te pierdas.
          Aquí está cada paso con imágenes reales, tres ejemplos completos y respuestas a las dudas más comunes.
        </p>
        <div className="no-print mt-5 flex flex-wrap gap-2">
          <Link href="/app/budgets/new?tour=1"><Button icon={<PlayCircle className="size-4" />}>Practicar con la guía en pantalla</Button></Link>
          <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>Imprimir este manual</Button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Contenido del manual" className="no-print lg:sticky lg:top-24 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Contenido</p>
          <ol className="space-y-1 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="block rounded-control px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg">{label}</a></li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 leading-relaxed">
          <H2 id="antes">Antes de empezar</H2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
            <li>El <strong>paciente debe estar registrado</strong> (menú <em>Pacientes → Nuevo paciente</em>). Si ya está en su ficha, el botón <em>Presupuesto</em> de la ficha abre uno con el paciente ya elegido.</li>
            <li>Los tratamientos y precios salen de la <strong>Lista de precios</strong> de la clínica. Si falta uno, pídele al administrador que lo agregue.</li>
            <li>Si no ves el botón <em>Nuevo presupuesto</em>, tu usuario no tiene permiso: pídeselo al administrador de la clínica.</li>
          </ul>
          <Shot src={`${IMG}/01-inicio.png`} alt="Menú Presupuestos y botón Nuevo presupuesto" />
          <Callouts items={[
            <>En el menú de la izquierda entra a <strong>Presupuestos</strong>.</>,
            <>Pulsa <strong>Nuevo presupuesto</strong>. ¿Dudas en algún momento? El botón <strong>¿Cómo se hace?</strong> abre la guía paso a paso sobre la misma pantalla.</>,
          ]} />

          <H2 id="paso-1">Paso 1 · Paciente y datos del presupuesto</H2>
          <Shot src={`${IMG}/02-paciente.png`} alt="Buscador de paciente con resultados" narrow={false} className="max-w-2xl" />
          <Callouts items={[
            <>Escribe parte del <strong>nombre, apellido o N° de historia clínica</strong> y elige al paciente de la lista. Al elegirlo se cargan solos su seguro, su convenio y su tarifario (si los tiene en la ficha).</>,
          ]} />
          <Shot src={`${IMG}/03-datos.png`} alt="Datos del presupuesto: doctor, fecha, seguro, convenio y estado" />
          <Callouts items={[
            <><strong>Doctor tratante</strong>: quien hará el tratamiento.</>,
            <><strong>Fecha</strong>: hoy por defecto. La vigencia del presupuesto se cuenta desde aquí.</>,
            <><strong>Compañía de seguros</strong>: déjalo vacío si es <strong>particular</strong>. Si tiene seguro, escribe la compañía y completa <em>Deducible por pieza</em> y <em>Coaseguro %</em>.</>,
            <><strong>Convenio</strong>: si el paciente es de una empresa o club con convenio, elígelo y el descuento se aplica solo.</>,
            <><strong>Estado</strong>: déjalo en <em>Borrador</em> mientras lo preparas.</>,
          ]} />

          <H2 id="paso-2">Paso 2 · Odontograma y tratamientos</H2>
          <p className="mt-3 text-sm">Por cada tratamiento: <strong>marca la pieza → elige el tratamiento → agrégalo</strong>. Repite las veces que necesites.</p>
          <Shot src={`${IMG}/04-odontograma.png`} alt="Pieza 1.6 con superficies oclusal y mesial seleccionadas" />
          <Callouts items={[
            <>Haz clic en las <strong>superficies</strong> de la pieza (los 5 cuadritos) para elegir sólo esas, o en el <strong>número</strong> de la pieza para elegirla completa. En el ejemplo: pieza <strong>1.6</strong>, superficies oclusal y mesial.</>,
            <>Aquí confirmas lo elegido: <strong>1.6 OM</strong>. La <strong>×</strong> borra la selección.</>,
          ]} />
          <Tip title="¿Qué significan las letras?">
            <p><strong>O</strong> oclusal (la cara que mastica) · <strong>V</strong> vestibular (la que da a la mejilla o al labio) · <strong>L</strong> lingual o palatina (la que da a la lengua o al paladar) · <strong>M</strong> mesial (hacia el centro de la boca) · <strong>D</strong> distal (hacia atrás).</p>
            <p>La numeración es la internacional (FDI): el primer número es el cuadrante (1 y 2 arriba, 3 y 4 abajo; 5 a 8 son dientes de leche) y el segundo, la pieza.</p>
          </Tip>
          <Shot src={`${IMG}/05-tratamiento.png`} alt="Buscador de tratamientos con resultado RESINA MODERADA" />
          <Callouts items={[
            <>Escribe parte del nombre del tratamiento (por ejemplo <em>resina mod</em>) y elígelo: ya viene con su precio.</>,
            <><strong>Agregar a pieza</strong> lo suma a la pieza marcada. <strong>General</strong> es para lo que no es de una pieza: examen, profilaxis, radiografías, blanqueamiento…</>,
          ]} />
          <Shot src={`${IMG}/04b-planificado.png`} alt="Odontograma con las piezas 1.6 y 4.6 resaltadas" caption="Las piezas que ya tienen tratamiento se resaltan con un borde punteado, para ver de un vistazo qué falta." />
          <Tip title="Hallazgos (opcional)">
            <p>Los botones de colores sobre el odontograma (Caries, Restauración, Ausente…) sirven para <strong>registrar lo que ves en boca</strong>. Elige uno y haz clic en la pieza o superficie. Para volver a agregar tratamientos, pulsa <strong>Seleccionar pieza</strong>.</p>
          </Tip>

          <H2 id="paso-3">Paso 3 · Revisar los tratamientos y el total</H2>
          <Shot src={`${IMG}/06-tratamientos.png`} alt="Tabla de tratamientos con descuento y total a cancelar" />
          <Callouts items={[
            <>Cada tratamiento agregado aparece aquí. Puedes cambiar la <strong>cantidad</strong> o el <strong>precio</strong>, o quitarlo con el tacho.</>,
            <><strong>Descuento</strong>: un monto en soles (no porcentaje) que se resta del total. Sólo para pacientes particulares.</>,
            <><strong>Total a cancelar</strong>: lo que pagará el paciente. En el ejemplo: 140 + 60 + 50 = 250, menos 20 de descuento = <strong>S/ 230.00</strong>.</>,
          ]} />
          <p className="text-sm">En <strong>Observaciones</strong> puedes escribir indicaciones que saldrán impresas (por ejemplo, número de citas o controles incluidos).</p>

          <H2 id="paso-4">Paso 4 · Guardar</H2>
          <Shot src={`${IMG}/07-guardar.png`} alt="Barra inferior con el botón Guardar presupuesto" />
          <Callouts items={[
            <>Pulsa <strong>Guardar presupuesto</strong>. Esta barra siempre está visible abajo. Al guardar, el presupuesto recibe su número.</>,
          ]} />
          <Tip title="¿Se cayó el internet?">
            <p>Igual puedes guardar: el presupuesto queda en el equipo y se envía solo cuando vuelve la conexión (arriba a la derecha verás <em>Sincronizado</em> cuando termine).</p>
          </Tip>

          <H2 id="despues">Después de guardar: estado, imprimir y editar</H2>
          <Shot src={`${IMG}/08-guardado.png`} alt="Presupuesto guardado con estado, imprimir y editar" />
          <Callouts items={[
            <><strong>Estado</strong>: Borrador → <strong>Entregado</strong> cuando se lo das al paciente → <strong>Aprobado</strong> si acepta o <strong>Rechazado</strong> si no. Si pasa su vigencia, márcalo <strong>Vencido</strong>. El Inicio te muestra cuánto se aprobó en el mes.</>,
            <><strong>Imprimir / PDF</strong>: para enviarlo por WhatsApp o correo, elige <em>Guardar como PDF</em> como impresora.</>,
            <><strong>Editar</strong>: para corregir. Si no lo ves, tu usuario no tiene permiso para editar presupuestos.</>,
          ]} />
          <Shot src={`${IMG}/09-documento.png`} alt="Documento impreso del presupuesto" className="mx-auto max-w-3xl"
            caption="Así lo recibe el paciente: datos de la clínica y del paciente, odontograma con las piezas a tratar, detalle, total, observaciones y firmas. (La marca de agua sólo aparece durante el periodo de implementación.)" />

          <H2 id="ejemplos">Ejemplos completos</H2>
          <h3 className="mt-6 font-semibold">A. Paciente particular, con descuento</h3>
          <p className="mt-2 text-sm">Es el ejemplo de los pasos anteriores: María Elena Quispe, sin seguro. Resina en la pieza 1.6 (OM) S/ 140 + extracción de la 4.6 S/ 60 + examen con odontograma S/ 50 = S/ 250, con S/ 20 de descuento: <strong>paga S/ 230</strong>.</p>

          <h3 className="mt-8 font-semibold">B. Paciente con seguro</h3>
          <Shot src={`${IMG}/10-seguro-datos.png`} alt="Datos con compañía de seguros, deducible y coaseguro" />
          <Callouts items={[<>Jorge Luis Huamán tiene <strong>Pacífico Seguros</strong> en su ficha: al elegirlo se completan solos la compañía, el deducible por pieza (S/ 30) y el coaseguro (20 %).</>]} />
          <Shot src={`${IMG}/10-seguro.png`} alt="Tratamientos con columnas de deducible y coaseguro" />
          <Callouts items={[
            <>Con seguro aparecen las columnas <strong>Deducible</strong> y <strong>Coaseguro</strong>.</>,
            <>El paciente paga, por cada pieza, el deducible más el coaseguro sobre el resto:</>,
            <>Resina S/ 120 → 30 + 20 % de 90 = <strong>48</strong>. Pulpectomía S/ 300 → 30 + 20 % de 270 = <strong>84</strong>. <strong>Paga S/ 132</strong>; el seguro cubre el resto.</>,
          ]} />

          <h3 className="mt-8 font-semibold">C. Paciente con convenio</h3>
          <Shot src={`${IMG}/11-convenio-datos.png`} alt="Convenio Colegio de Ingenieros del Perú elegido" />
          <Callouts items={[<>Rosa Mendoza es socia del <strong>Colegio de Ingenieros del Perú</strong> (10 %): el convenio se elige solo al seleccionarla.</>]} />
          <Shot src={`${IMG}/11-convenio.png`} alt="Tratamientos con precio tachado y ahorro por convenio" />
          <Callouts items={[
            <>Cada tratamiento muestra el precio normal tachado y el precio con convenio.</>,
            <>El <strong>ahorro por convenio</strong> aparece en verde: 155 + 50 = 205, menos 10 % (S/ 20.50) = <strong>S/ 184.50</strong>.</>,
          ]} />

          <H2 id="celular">Desde el celular o la tablet</H2>
          <p className="mt-3 text-sm">La misma pantalla se acomoda al celular: los pasos van uno debajo del otro y el botón <strong>Guardar presupuesto</strong> queda siempre abajo. El odontograma se puede desplazar hacia los lados con el dedo.</p>
          <Shot src={`${IMG}/13-celular.png`} alt="Nuevo presupuesto en un celular" narrow />

          <H2 id="guia">La guía en la pantalla</H2>
          <p className="mt-3 text-sm">La primera vez que entras a <em>Nuevo presupuesto</em> se abre una guía que resalta cada parte y explica qué hacer. Puedes avanzar con <strong>Siguiente</strong> o las flechas del teclado, y cerrarla con <strong>Esc</strong>. Para verla otra vez, pulsa <strong>¿Cómo se hace?</strong></p>
          <Shot src={`${IMG}/12-guia.png`} alt="Guía paso a paso resaltando el odontograma" />

          <H2 id="preguntas">Preguntas frecuentes</H2>
          <dl className="mt-4 space-y-4 text-sm">
            {[
              ['No encuentro al paciente en el buscador.', 'Busca por apellido o por N° de historia. Si es nuevo, regístralo primero en Pacientes → Nuevo paciente. Si está inactivo, actívalo en su ficha.'],
              ['El precio no es el que esperaba.', 'El precio sale del tarifario del paciente (o de la lista de precios general). Puedes corregirlo en la columna P. unit. de ese presupuesto. Para cambiarlo para siempre, el administrador lo actualiza en Lista de precios.'],
              ['El botón «Agregar a pieza» está gris.', 'Falta marcar la pieza en el odontograma o elegir el tratamiento. Si el tratamiento no es de una pieza, usa «General».'],
              ['Agregué un tratamiento por error.', 'Quítalo con el tacho en la tabla de tratamientos, antes de guardar. Si ya guardaste, usa Editar.'],
              ['Me equivoqué de pieza o superficie.', 'Quita el tratamiento con el tacho, marca la pieza correcta y vuelve a agregarlo.'],
              ['No me deja editar un presupuesto guardado.', 'Editar requiere un permiso que da el administrador de la clínica: Usuarios → editar el usuario → «Puede editar presupuestos emitidos».'],
              ['¿Cómo lo envío por WhatsApp?', 'Abre el presupuesto, pulsa Imprimir / PDF, elige «Guardar como PDF» y adjunta el archivo en WhatsApp o correo.'],
              ['El impreso dice «documento sin validez».', 'Es la marca de agua del periodo de implementación (pruebas). Desaparece cuando la clínica pasa a producción.'],
            ].map(([q, a]) => (
              <Card key={q} className="p-4">
                <dt className="font-semibold">{q}</dt>
                <dd className="mt-1 text-muted">{a}</dd>
              </Card>
            ))}
          </dl>
          <p className="mt-8 text-sm text-muted">¿Algo no quedó claro? Escríbenos desde <Link href="/app/requests?new=1" className="text-brand hover:underline">Soporte y mejoras</Link>: puedes pegar una captura de pantalla de tu duda.</p>
        </article>
      </div>
    </div>
  );
}
