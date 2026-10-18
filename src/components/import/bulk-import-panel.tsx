'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileUp, ListChecks, RotateCcw, Upload } from 'lucide-react';
import { Badge, Button, Card, cx, EmptyState, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/client/api';
import { formatDateTime } from '@/lib/shared/format';
import {
  IMPORT_SPECS, MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, type ImportBatchRow, type ImportEntity, type ImportIssue, type ImportResult,
} from '@/lib/shared/import-spec';

const SHOW_ERRORS = 200;
const nf = (n: number) => n.toLocaleString('es-PE');

/** Reporte de errores en CSV (UTF-8 con BOM, separador ;) para abrir en Excel. */
function downloadErrors(result: ImportResult) {
  // Valores que Excel interpretaría como fórmula (=, +, -, @, tab, CR) se neutralizan con un apóstrofo
  const esc = (raw: string) => {
    const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[;"\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const lines = ['fila;columna;tipo;detalle',
    ...result.errors.map((e) => [e.row ?? '', e.column ?? '', 'Error', e.message].map((v) => esc(String(v))).join(';')),
    ...result.warnings.map((e) => [e.row ?? '', e.column ?? '', 'Advertencia', e.message].map((v) => esc(String(v))).join(';'))];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `errores-${result.fileName.replace(/\.[^.]+$/, '')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Carga masiva por pasos (doctores → … → presupuestos). La usan el administrador de la clínica (/app/import)
 * y el super admin desde la ficha de la clínica. `base` = endpoint de la API (/api/import o /api/admin/tenants/<id>/import).
 */
export function BulkImportPanel({ base }: { base: string }) {
  const toast = useToast();
  const [entity, setEntity] = useState<ImportEntity>('DOCTORS');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'validate' | 'import' | null>(null);
  const [history, setHistory] = useState<ImportBatchRow[] | null>(null);
  const [available, setAvailable] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const spec = IMPORT_SPECS.find((s) => s.code === entity)!;

  const loadHistory = useCallback(() => {
    api<{ available: boolean; history: ImportBatchRow[] }>(base)
      .then((r) => { setHistory(r.history); setAvailable(r.available); })
      .catch(() => setHistory([]));
  }, [base]);
  useEffect(loadHistory, [loadHistory]);

  const lastByEntity = useMemo(() => {
    const m = new Map<string, ImportBatchRow>();
    for (const h of history ?? []) if (!m.has(h.entity_code)) m.set(h.entity_code, h);
    return m;
  }, [history]);

  const reset = () => { setFile(null); setResult(null); if (inputRef.current) inputRef.current.value = ''; };
  const choose = (code: ImportEntity) => { setEntity(code); reset(); };

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setResult(null);
    if (f && f.size > MAX_IMPORT_BYTES) {
      toast.error('El archivo supera los 10 MB.');
      e.target.value = '';
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function send(mode: 'validate' | 'import') {
    if (!file) return;
    setBusy(mode);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('entity', entity);
      form.set('mode', mode);
      const r = await api<ImportResult>(base, { form });
      setResult(r);
      if (mode === 'import') {
        loadHistory();
        if (r.status === 'COMPLETED') toast.success(`Importación completada: ${nf(r.createCount)} nuevos, ${nf(r.updateCount)} actualizados.`);
        else if (r.status === 'PARTIAL') toast.info('Importación parcial: revisa las filas con error.');
        else toast.error('No se importó ninguna fila.');
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'No se pudo procesar el archivo.');
    } finally { setBusy(null); }
  }

  if (!available) {
    return (
      <Card>
        <EmptyState icon={<AlertTriangle className="size-6" />} title="Carga masiva no disponible"
          description="La carga masiva sólo está habilitada mientras la clínica está en su periodo de implementación." />
      </Card>
    );
  }

  const imported = result?.mode === 'import';
  return (
    <div className="space-y-6">
      {/* Pasos en orden de dependencias */}
      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-lg bg-brand-soft p-2 text-brand"><ListChecks className="size-5" /></div>
          <div className="min-w-0">
            <h2 className="font-semibold">Orden de carga</h2>
            <p className="text-sm text-muted">
              Carga la información en este orden: cada paso usa lo cargado en los anteriores (por ejemplo, las citas necesitan pacientes y doctores).
              Puedes volver a subir un archivo corregido: los registros existentes se actualizan, no se duplican.
            </p>
          </div>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Pasos de la carga masiva">
          {IMPORT_SPECS.map((s) => {
            const last = lastByEntity.get(s.code);
            const active = s.code === entity;
            return (
              <li key={s.code}>
                <button type="button" onClick={() => choose(s.code)} aria-pressed={active}
                  className={cx('flex h-full w-full items-start gap-3 rounded-control border p-3 text-left transition-colors',
                    active ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2')}>
                  <span className={cx('grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                    active ? 'bg-brand text-brand-contrast' : 'bg-surface-2 text-muted')}>{s.step}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.title}</span>
                    {last
                      ? <span className="mt-1 block"><Badge color={last.status_color}>{last.status_name} · {formatDateTime(last.created_at)}</Badge></span>
                      : <span className="mt-0.5 block text-xs text-subtle">{s.dependsOn ? `Requiere: ${s.dependsOn}` : 'Sin dependencias'}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      {/* Paso seleccionado */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Paso {spec.step} de {IMPORT_SPECS.length}</p>
            <h2 className="text-lg font-semibold">{spec.title}</h2>
            <p className="text-sm text-muted">{spec.summary}</p>
            <p className="mt-1 text-xs text-muted">Al volver a cargar se reconocen por: {spec.matchBy}.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`${base}/template/${spec.slug}`} download>
              <Button variant="secondary" icon={<FileSpreadsheet className="size-4" />}>Plantilla Excel</Button>
            </a>
            <a href={`${base}/template/${spec.slug}?format=csv`} download>
              <Button variant="ghost" icon={<Download className="size-4" />}>CSV de ejemplo</Button>
            </a>
          </div>
        </div>

        <details className="mt-4 rounded-control border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Columnas de la plantilla ({spec.columns.length})</summary>
          <ul className="divide-y divide-line text-sm">
            {spec.columns.map((c) => (
              <li key={c.key} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
                <span className="w-48 shrink-0 font-mono text-xs">
                  {c.key}{c.required === true && <span className="text-danger" aria-label="obligatoria"> *</span>}
                </span>
                <span className="text-muted">{c.description}{c.format && <span className="text-subtle"> — {c.format}</span>}</span>
              </li>
            ))}
          </ul>
        </details>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-control border border-dashed border-line-strong bg-surface px-4 text-sm font-medium hover:bg-surface-2">
            <FileUp className="size-4" /> {file ? 'Cambiar archivo' : 'Elegir archivo (.xlsx o .csv)'}
            <input ref={inputRef} type="file" className="sr-only" aria-label="Archivo a importar"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={onFile} />
          </label>
          {file && <span className="min-w-0 truncate text-sm text-muted" title={file.name}>{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
          <div className="flex gap-2 sm:ml-auto">
            {file && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={reset} disabled={!!busy}>Quitar</Button>}
            <Button onClick={() => send('validate')} loading={busy === 'validate'} disabled={!file || !!busy} icon={<ListChecks className="size-4" />}>
              Validar archivo
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-subtle">Hasta {nf(MAX_IMPORT_ROWS)} filas y 10 MB por archivo. Primero se valida (no se guarda nada); luego confirmas la importación.</p>
      </Card>

      {busy === 'import' && <Card><Spinner label="Importando… con miles de filas puede tardar hasta un minuto. No cierres esta ventana." /></Card>}

      {result && !busy && <ResultCard result={result} imported={imported} onImport={() => send('import')} onReset={reset} />}

      {/* Historial */}
      <Card>
        <div className="border-b border-line px-5 py-3"><h2 className="font-semibold">Historial de cargas</h2></div>
        {!history ? <Spinner /> : history.length === 0 ? (
          <EmptyState title="Aún no hay cargas" description="Aquí verás cada importación con sus filas correctas y con error." />
        ) : (
          <Table>
            <thead><tr><Th>Fecha</Th><Th>Datos</Th><Th>Archivo</Th><Th className="text-right">Filas</Th><Th className="text-right">Con error</Th><Th className="text-right">Nuevos / act.</Th><Th>Estado</Th><Th>Usuario</Th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <Td label="Fecha">{formatDateTime(h.created_at)}</Td>
                  <Td label="Datos">{h.entity_name}</Td>
                  <Td label="Archivo"><span className="break-all">{h.file_name}</span></Td>
                  <Td label="Filas" className="text-right tabular-nums">{nf(h.total_rows)}</Td>
                  <Td label="Con error" className="text-right tabular-nums">{nf(h.error_rows)}</Td>
                  <Td label="Nuevos / act." className="text-right tabular-nums">{nf(h.created_rows)} / {nf(h.updated_rows)}</Td>
                  <Td label="Estado"><Badge color={h.status_color}>{h.status_name}</Badge></Td>
                  <Td label="Usuario">{h.created_by_name ?? '—'}{Number(h.by_platform) === 1 && <span className="text-xs text-subtle"> (OdontoSis)</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ResultCard({ result, imported, onImport, onReset }: { result: ImportResult; imported: boolean; onImport: () => void; onReset: () => void }) {
  const r = result;
  const stats: [string, number, string?][] = [
    ['Filas', r.totalRows], ['Válidas', r.okRows, 'text-success'], ['Con error', r.errorRows, r.errorRows ? 'text-danger' : undefined],
    [imported ? 'Nuevos' : 'Se crearán', r.createCount], [imported ? 'Actualizados' : 'Se actualizarán', r.updateCount],
  ];
  return (
    <Card className="p-4 sm:p-5" aria-live="polite">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          {imported
            ? <><CheckCircle2 className="size-5 text-success" /> {r.status === 'COMPLETED' ? 'Importación completada' : r.status === 'PARTIAL' ? 'Importación parcial' : 'Importación fallida'}</>
            : <><ListChecks className="size-5 text-brand" /> Resultado de la validación</>}
        </h2>
        <span className="text-xs text-muted">{r.fileName} · {(r.durationMs / 1000).toFixed(1)} s</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([label, value, cls]) => (
          <div key={label} className="rounded-control border border-line p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className={cx('text-xl font-semibold tabular-nums', cls)}>{nf(value)}</dd>
          </div>
        ))}
      </dl>
      {!imported && (
        <p className="mt-3 text-sm text-muted">
          {r.okRows > 0 && r.createCount + r.updateCount === 0
            ? 'No hay registros nuevos ni cambios para importar. Revisa las advertencias.'
            : r.okRows > 0
            ? r.errorRows > 0
              ? 'Puedes importar sólo las filas válidas (las filas con error se omiten) o corregir el archivo y validarlo de nuevo.'
              : 'Todas las filas son válidas. Confirma para guardarlas.'
            : 'Corrige los errores y vuelve a validar el archivo.'}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!imported && r.okRows > 0 && r.createCount + r.updateCount > 0 && (
          <Button onClick={onImport} icon={<Upload className="size-4" />}>Importar {nf(r.okRows)} fila{r.okRows === 1 ? '' : 's'} válida{r.okRows === 1 ? '' : 's'}</Button>
        )}
        {(r.errors.length > 0 || r.warnings.length > 0) && (
          <Button variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadErrors(r)}>Descargar reporte de errores</Button>
        )}
        {imported && <Button variant="ghost" onClick={onReset}>Cargar otro archivo</Button>}
      </div>
      {r.warnings.length > 0 && <IssueList title={`Advertencias (${nf(r.warnings.length)})`} items={r.warnings} tone="warning" />}
      {r.errors.length > 0 && <IssueList title={`Errores (${nf(r.errors.length)})`} items={r.errors} tone="danger" />}
    </Card>
  );
}

function IssueList({ title, items, tone }: { title: string; items: ImportIssue[]; tone: 'warning' | 'danger' }) {
  return (
    <div className="mt-5">
      <h3 className={cx('mb-2 flex items-center gap-2 text-sm font-semibold', tone === 'danger' ? 'text-danger' : 'text-warning')}>
        <AlertTriangle className="size-4" /> {title}
      </h3>
      <div className="max-h-96 overflow-y-auto rounded-control border border-line">
        <Table>
          <thead><tr><Th className="w-20">Fila</Th><Th className="w-48">Columna</Th><Th>Detalle</Th></tr></thead>
          <tbody>
            {items.slice(0, SHOW_ERRORS).map((e, i) => (
              <tr key={i}>
                <Td label="Fila" className="tabular-nums">{e.row ?? '—'}</Td>
                <Td label="Columna"><span className="font-mono text-xs">{e.column ?? '—'}</span></Td>
                <Td label="Detalle">{e.message}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      {items.length > SHOW_ERRORS && <p className="mt-1 text-xs text-muted">Se muestran {SHOW_ERRORS} de {nf(items.length)}. Descarga el reporte para verlos todos.</p>}
    </div>
  );
}
