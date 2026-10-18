'use client';
import { useEffect, useMemo, useState } from 'react';
import { Select } from '@/components/ui';
import { api } from '@/lib/client/api';

type Item = { id: string; code: string; name: string; parent_id: string | null };
type Data = { departments: Item[]; provinces: Item[]; districts: Item[] };

let cache: Promise<Data> | null = null;
/** Catálogo de ubigeo (INEI) desde el maestro de maestros; se descarga una vez por sesión */
function loadUbigeo(): Promise<Data> {
  cache ??= Promise.all(['UBIGEO_DEPARTMENT', 'UBIGEO_PROVINCE', 'UBIGEO_DISTRICT'].map((t) => api<Item[]>(`/api/masters?table=${t}`)))
    .then(([departments, provinces, districts]) => ({ departments, provinces, districts }))
    .catch((e) => { cache = null; throw e; });
  return cache;
}

/** Departamento / Provincia / Distrito encadenados. El valor guardado es el distrito. */
export function UbigeoPicker({ value, onChange, defaultDepartmentCode = '15', error }: {
  value: string | null; onChange: (districtId: string | null) => void; defaultDepartmentCode?: string; error?: string | null;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [dep, setDep] = useState('');
  const [prov, setProv] = useState('');

  useEffect(() => { loadUbigeo().then(setData).catch(() => setFailed(true)); }, []);

  // Al cargar (o al editar un paciente con distrito), deduce provincia y departamento
  useEffect(() => {
    if (!data) return;
    const d = value ? data.districts.find((x) => x.id === value) : null;
    const p = d ? data.provinces.find((x) => x.id === d.parent_id) : null;
    if (p) { setProv(p.id); setDep(p.parent_id ?? ''); }
    else if (!dep) setDep(data.departments.find((x) => x.code === defaultDepartmentCode)?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, value]);

  const provinces = useMemo(() => (data ? data.provinces.filter((p) => p.parent_id === dep) : []), [data, dep]);
  const districts = useMemo(() => (data ? data.districts.filter((d) => d.parent_id === prov) : []), [data, prov]);
  const opt = (l: Item[]) => l.map((x) => ({ value: x.id, label: x.name }));

  if (failed) return <p className="text-xs text-muted sm:col-span-3">El ubigeo requiere conexión.</p>;
  return (
    <>
      <Select label="Departamento" value={dep} onChange={(e) => { setDep(e.target.value); setProv(''); onChange(null); }} placeholder="—" options={opt(data?.departments ?? [])} />
      <Select label="Provincia" value={prov} onChange={(e) => { setProv(e.target.value); onChange(null); }} placeholder="—" options={opt(provinces)} disabled={!dep} />
      <Select label="Distrito" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} placeholder="—" options={opt(districts)} disabled={!prov} error={error} />
    </>
  );
}
