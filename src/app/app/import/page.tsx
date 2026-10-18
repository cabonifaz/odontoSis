import { FlaskConical } from 'lucide-react';
import { requirePageSession } from '@/lib/server/guard';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { BulkImportPanel } from '@/components/import/bulk-import-panel';
import { formatDate } from '@/lib/shared/format';

/** Carga masiva: sólo administrador de la clínica y sólo durante el periodo de implementación. */
export default async function ImportPage() {
  const s = await requirePageSession({ platform: false, perm: 'settings.manage' });
  const access = s.tenant!.access;
  return (
    <>
      <PageHeader title="Carga masiva"
        subtitle={access.phase === 'IMPLEMENTATION'
          ? `Importa tu información desde Excel o CSV. Disponible durante la implementación (hasta el ${formatDate(access.until)}).`
          : 'Importa tu información desde Excel o CSV.'} />
      {access.phase === 'IMPLEMENTATION' ? <BulkImportPanel base="/api/import" /> : (
        <Card>
          <EmptyState icon={<FlaskConical className="size-6" />} title="Disponible sólo durante la implementación"
            description="La carga masiva se habilita mientras la clínica está en su periodo de implementación. Si necesitas cargar datos, solicítalo a OdontoSis desde Soporte y mejoras." />
        </Card>
      )}
    </>
  );
}
