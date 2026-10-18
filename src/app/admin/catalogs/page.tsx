'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Database, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Modal, PageHeader, Select, Spinner, Table, Td, Th, cx } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, fieldErrors } from '@/lib/client/api';

type MasterTable = { id: string; code: string; name: string; description: string | null; tenant_editable: number | boolean };
type MasterItem = {
  id: string; table_code: string; code: string; name: string; value: string | null; sort_order: number;
  is_active: number | boolean; is_system: number | boolean; tenant_id: string | null;
};
type ItemForm = { id: string; code: string; name: string; value: string; sortOrder: string; isActive: boolean; isSystem: boolean };

const truthy = (v: number | boolean | null | undefined) => Number(v) === 1 || v === true;
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Ayuda contextual para el campo "valor" según la tabla. */
function valueHint(table: string): string {
  if (table === 'TOOTH_CONDITION') return 'JSON: {"color":"#DC2626","scope":"surface|tooth","symbol":"fill|cross|circle|ellipse|line|zigzag"}';
  if (/STATUS/.test(table)) return 'Color del estado en formato #RRGGBB.';
  if (table === 'CURRENCY') return 'Símbolo de la moneda (ej.: S/).';
  return 'Opcional. Dato adicional usado por el sistema (máx. 255 caracteres).';
}

/** Valida el JSON de TOOTH_CONDITION en el cliente (el servidor sólo valida longitud). */
function toothConditionError(v: string): string | null {
  if (!v.trim()) return null;
  try {
    const o = JSON.parse(v) as Record<string, unknown>;
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return 'Debe ser un objeto JSON.';
    if (o.color !== undefined && (typeof o.color !== 'string' || !HEX.test(o.color))) return 'color debe ser #RRGGBB.';
    if (o.scope !== undefined && !['surface', 'tooth'].includes(String(o.scope))) return 'scope debe ser surface o tooth.';
    if (o.symbol !== undefined && !['fill', 'cross', 'circle', 'ellipse', 'line', 'zigzag'].includes(String(o.symbol))) {
      return 'symbol debe ser fill, cross, circle, ellipse, line o zigzag.';
    }
    return null;
  } catch {
    return 'JSON inválido.';
  }
}

/** Muestra de color si el valor es (o contiene) un color hex. */
function ValueCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-subtle">—</span>;
  let color: string | null = HEX.test(value) ? value : null;
  if (!color && value.startsWith('{')) {
    try { const o = JSON.parse(value) as { color?: unknown }; if (typeof o.color === 'string' && HEX.test(o.color)) color = o.color; } catch { /* no JSON */ }
  }
  return (
    <span className="inline-flex max-w-xs items-center gap-2">
      {color && <span className="size-3 shrink-0 rounded-full border border-line" style={{ backgroundColor: color }} aria-hidden />}
      <span className="truncate font-mono text-xs" title={value}>{value}</span>
    </span>
  );
}

export default function CatalogsPage() {
  const toast = useToast();
  const [tables, setTables] = useState<MasterTable[] | null>(null);
  const [table, setTable] = useState('');
  const [items, setItems] = useState<MasterItem[] | null>(null);
  const [form, setForm] = useState<ItemForm | null>(null);
  const [isNew, setIsNew] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<MasterItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api<MasterTable[]>('/api/masters?tables=1')
      .then((t) => { setTables(t); if (t[0]) setTable((cur) => cur || t[0].code); })
      .catch((e) => { setTables([]); toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar los catálogos.'); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useRef('');
  const loadItems = useCallback(async (code: string) => {
    if (!code) return;
    selected.current = code;
    try {
      const r = await api<MasterItem[]>(`/api/masters?table=${encodeURIComponent(code)}&all=1`);
      if (selected.current === code) setItems(r); // descarta respuestas de una tabla ya no seleccionada
    } catch (e) {
      if (selected.current !== code) return;
      setItems([]);
      toast.error(e instanceof ApiError ? e.message : 'No se pudieron cargar los ítems.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setItems(null); loadItems(table); }, [table, loadItems]);

  const current = tables?.find((t) => t.code === table);

  const openNew = () => {
    setErrors({});
    setIsNew(true);
    const next = items && items.length ? Math.max(...items.map((i) => Number(i.sort_order) || 0)) + 1 : 1;
    setForm({ id: crypto.randomUUID(), code: '', name: '', value: '', sortOrder: String(next), isActive: true, isSystem: false });
  };
  const openEdit = (i: MasterItem) => {
    setErrors({});
    setIsNew(false);
    setForm({ id: i.id, code: i.code, name: i.name, value: i.value ?? '', sortOrder: String(i.sort_order ?? 0), isActive: truthy(i.is_active), isSystem: truthy(i.is_system) });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (table === 'TOOTH_CONDITION') {
      const err = toothConditionError(form.value);
      if (err) { setErrors({ value: err }); return; }
    }
    setSaving(true);
    setErrors({});
    try {
      await api('/api/masters', {
        body: { id: form.id, tableCode: table, code: form.code.trim().toUpperCase(), name: form.name, value: form.value.trim() || null,
          sortOrder: form.sortOrder, isActive: form.isActive },
      });
      toast.success(isNew ? 'Ítem creado.' : 'Ítem actualizado.');
      setForm(null);
      await loadItems(table);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api(`/api/masters/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Ítem eliminado.');
      setToDelete(null);
      await loadItems(table);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo eliminar.');
    } finally {
      setDeleting(false);
    }
  }

  const upd = (k: 'code' | 'name' | 'value' | 'sortOrder') => (e: { target: { value: string } }) => setForm((f) => (f ? { ...f, [k]: e.target.value } : f));

  return (
    <>
      <PageHeader title="Catálogos" subtitle="Tablas maestras globales de la plataforma" />
      {!tables ? <Spinner /> : tables.length === 0 ? (
        <Card><EmptyState icon={<Database className="size-6" />} title="No hay tablas maestras" /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Móvil: selector; escritorio: lista lateral */}
          <div className="lg:hidden">
            <Select label="Catálogo" value={table} onChange={(e) => setTable(e.target.value)}
              options={tables.map((t) => ({ value: t.code, label: t.name }))} />
          </div>
          <Card className="hidden self-start overflow-hidden lg:block">
            <nav aria-label="Tablas maestras">
              <ul className="max-h-[70dvh] divide-y divide-line overflow-y-auto">
                {tables.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => setTable(t.code)} aria-current={t.code === table ? 'true' : undefined}
                      className={cx('w-full px-4 py-2.5 text-left text-sm transition-colors',
                        t.code === table ? 'bg-brand-soft font-medium text-brand' : 'hover:bg-surface-2')}>
                      <span className="block truncate">{t.name}</span>
                      <span className="block truncate font-mono text-xs text-muted">{t.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          </Card>

          <Card className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h2 className="font-semibold">{current?.name ?? table}</h2>
                <p className="text-xs text-muted">
                  <span className="font-mono">{table}</span>
                  {current?.description && <> · {current.description}</>}
                  {current && <> · {truthy(current.tenant_editable) ? 'Las clínicas pueden agregar ítems propios' : 'Sólo editable por la plataforma'}</>}
                </p>
              </div>
              <Button icon={<Plus className="size-4" />} onClick={openNew} disabled={!table}>Nuevo ítem</Button>
            </div>
            {!items ? <Spinner /> : items.length === 0 ? (
              <EmptyState title="Sin ítems" description="Agrega el primer ítem de este catálogo." />
            ) : (
              <Table>
                <thead><tr><Th>Orden</Th><Th>Código</Th><Th>Nombre</Th><Th>Valor</Th><Th>Estado</Th><Th className="text-right">Acciones</Th></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id}>
                      <Td label="Orden" className="tabular-nums">{i.sort_order}</Td>
                      <Td label="Código"><span className="font-mono text-xs">{i.code}</span></Td>
                      <Td label="Nombre">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          {i.name}
                          {truthy(i.is_system) && <Lock className="size-3.5 text-subtle" aria-label="Ítem del sistema" />}
                        </span>
                      </Td>
                      <Td label="Valor"><ValueCell value={i.value} /></Td>
                      <Td label="Estado">{truthy(i.is_active) ? <Badge color="var(--success)">Activo</Badge> : <Badge>Inactivo</Badge>}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" aria-label={`Editar ${i.name}`} title="Editar" onClick={() => openEdit(i)}><Pencil className="size-4" /></Button>
                          {!truthy(i.is_system) && (
                            <Button variant="ghost" size="sm" className="text-danger" aria-label={`Eliminar ${i.name}`} title="Eliminar" onClick={() => setToDelete(i)}><Trash2 className="size-4" /></Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={isNew ? 'Nuevo ítem' : 'Editar ítem'}
        footer={<><Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
          <Button type="submit" form="item-form" loading={saving}>Guardar</Button></>}>
        {form && (
          <form id="item-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Input label="Código" required value={form.code} onChange={upd('code')} error={errors.code} disabled={form.isSystem}
              hint={form.isSystem ? 'El código de un ítem del sistema no se puede cambiar.' : 'Letras, números, guion y guion bajo.'} />
            <Input label="Nombre" required value={form.name} onChange={upd('name')} error={errors.name} />
            <Input label="Valor" className="sm:col-span-2" value={form.value} onChange={upd('value')} error={errors.value} maxLength={255}
              hint={valueHint(table)} spellCheck={false} />
            <Input label="Orden" type="number" min={0} max={9999} value={form.sortOrder} onChange={upd('sortOrder')} error={errors.sortOrder} />
            <div className="flex items-end pb-2">
              <Checkbox label="Activo" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar ítem" size="sm"
        footer={<><Button variant="secondary" onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button variant="danger" loading={deleting} onClick={remove}>Eliminar</Button></>}>
        <p className="text-sm">¿Eliminar <strong>{toDelete?.name}</strong> ({toDelete?.code}) del catálogo? Si está en uso, considera desactivarlo en su lugar.</p>
      </Modal>
    </>
  );
}
