'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudUpload, Plus, Search, ShieldAlert, Users, X } from 'lucide-react';
import { Badge, Button, Card, cx, EmptyState, Input, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { useApp, can } from '@/lib/client/app-context';
import { ageFrom } from '@/lib/shared/format';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function PatientsPage() {
  const { db, session } = useApp();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(50);
  /** Filtro «sin consentimientos» (también desde el Inicio: ?consent=missing) */
  const [noConsent, setNoConsent] = useState(useSearchParams().get('consent') === 'missing');
  const all = useLiveQuery(async () => db?.patients.orderBy('last_name').toArray(), [db]);

  const lacks = (p: { consent_status?: string | null; is_active: number }) => !!p.is_active && p.consent_status !== 'OK';
  const missingCount = useMemo(() => (all ?? []).filter(lacks).length, [all]);
  const filtered = useMemo(() => {
    if (!all) return [];
    const base = noConsent ? all.filter(lacks) : all;
    const n = norm(q.trim());
    return n ? base.filter((p) => norm(`${p.first_name} ${p.last_name} ${p.mother_last_name ?? ''} ${p.last_name} ${p.mother_last_name ?? ''} ${p.first_name}`).includes(n) || p.record_number === q.trim() || p.phone?.replace(/\s/g, '').includes(q.replace(/\s/g, ''))) : base;
  }, [all, q, noConsent]);

  return (
    <>
      <PageHeader title="Pacientes" subtitle={all ? `${all.length} pacientes` : undefined}
        actions={can(session, 'patients.write') && <Link href="/app/patients/new"><Button icon={<Plus className="size-4" />}>Nuevo paciente</Button></Link>} />
      <Card>
        <div className="border-b border-line p-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input aria-label="Buscar" placeholder="Buscar por nombre, H.C. o teléfono" value={q} onChange={(e) => setQ(e.target.value)} className="[&_input]:pl-9" />
          </div>
          {missingCount > 0 && (
            <button type="button" onClick={() => setNoConsent((v) => !v)} aria-pressed={noConsent}
              className={cx('mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                noConsent ? 'border-warning bg-warning/15 font-medium text-fg' : 'border-line text-muted hover:bg-surface-2')}>
              <ShieldAlert className="size-4 text-warning" aria-hidden /> Sin consentimientos <span className="tabular-nums">{missingCount}</span>
              {noConsent && <X className="size-3.5" aria-label="Quitar filtro" />}
            </button>
          )}
        </div>
        {!all ? <Spinner /> : filtered.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title={q ? 'Sin resultados' : 'Aún no hay pacientes'} description={q ? 'Prueba con otro término.' : 'Registra el primer paciente de la clínica.'} />
        ) : (
          <>
            <Table>
              <thead><tr><Th>H.C.</Th><Th>Paciente</Th><Th>Edad</Th><Th>Teléfono</Th><Th>Seguro</Th><Th /></tr></thead>
              <tbody>
                {filtered.slice(0, limit).map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-surface-2" onClick={() => router.push(`/app/patients/${p.id}`)}>
                    <Td label="H.C." className="font-mono text-xs">{p.record_number ?? '—'}</Td>
                    <Td label="Paciente">
                      <Link href={`/app/patients/${p.id}`} className="font-medium hover:text-brand">{[p.last_name, p.mother_last_name].filter(Boolean).join(' ')}, {p.first_name}</Link>
                      {!!p.requires_guardian && p.guardian_name && <p className="text-xs text-muted">Apoderado: {p.guardian_name}{p.guardian_relationship_name ? ` (${p.guardian_relationship_name})` : ''}</p>}
                    </Td>
                    <Td label="Edad">{ageFrom(p.birth_date) ?? '—'}</Td>
                    <Td label="Teléfono">{p.phone ?? p.guardian_phone ?? '—'}</Td>
                    <Td label="Seguro">{p.insurance_company ?? 'Particular'}</Td>
                    <Td className="text-right">
                      {lacks(p) && !p.pending && <span title={p.consent_status === 'PARTIAL' ? 'Falta un consentimiento' : 'Sin consentimientos'} className="mr-1.5 inline-flex align-middle text-warning"><ShieldAlert className="size-4" aria-label="Sin consentimientos completos" /></span>}
                      {p.pending && <Badge color="var(--warning)"><CloudUpload className="size-3" /> Pendiente</Badge>}
                      {!p.is_active && <Badge>Inactivo</Badge>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {filtered.length > limit && (
              <div className="p-4 text-center"><Button variant="ghost" onClick={() => setLimit((l) => l + 100)}>Mostrar más ({filtered.length - limit})</Button></div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
