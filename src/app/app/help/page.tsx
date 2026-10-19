'use client';
import Link from 'next/link';
import { BookOpen, ClipboardList, LifeBuoy, PlayCircle } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';

/** Centro de ayuda: manuales ilustrados y accesos a las guías paso a paso en pantalla */
export default function HelpPage() {
  return (
    <>
      <PageHeader title="Ayuda" subtitle="Manuales con imágenes y guías paso a paso sobre las pantallas." />
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/app/help/presupuestos" className="group rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
            <div className="flex items-start gap-4">
              <span className="rounded-lg bg-brand-soft p-2.5 text-brand"><ClipboardList className="size-6" /></span>
              <div>
                <p className="font-semibold group-hover:text-brand">Cómo crear un presupuesto</p>
                <p className="mt-1 text-sm text-muted">Los 4 pasos con capturas reales, ejemplos con seguro y convenio, imprimir en PDF y preguntas frecuentes.</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand"><BookOpen className="size-4" /> Leer el manual</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/app/budgets/new?tour=1" className="group rounded-card focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full p-5 transition-shadow group-hover:shadow-md">
            <div className="flex items-start gap-4">
              <span className="rounded-lg bg-brand-soft p-2.5 text-brand"><PlayCircle className="size-6" /></span>
              <div>
                <p className="font-semibold group-hover:text-brand">Practicar con la guía en pantalla</p>
                <p className="mt-1 text-sm text-muted">Abre un presupuesto nuevo con la guía que resalta cada parte y explica qué hacer. Nada se guarda hasta que pulses «Guardar».</p>
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand"><PlayCircle className="size-4" /> Empezar</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
      <Card className="mt-6 p-5 text-sm">
        <p className="font-semibold">En cada pantalla</p>
        <p className="mt-1 text-muted">Busca el botón <strong className="text-fg">¿Cómo se hace?</strong> arriba a la derecha: abre la guía de esa pantalla. ¿No encuentras lo que buscas?{' '}
          <Link href="/app/requests?new=1" className="inline-flex items-center gap-1 text-brand hover:underline"><LifeBuoy className="size-3.5" />Escríbenos</Link>.</p>
      </Card>
    </>
  );
}
