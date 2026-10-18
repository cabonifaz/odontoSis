import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';

/**
 * Carga masiva durante la implementación: plantillas, validación (dry run) con errores por fila,
 * importación de doctores → servicios → pacientes → historias → citas → presupuesto, re-importación
 * idempotente y bloqueo fuera de la implementación.
 */
const stamp = Date.now().toString().slice(-6);
const DR = `E2E${stamp}`;
const SVC = `S${stamp}`;
const DNI_A = `7${stamp}1`;
const DNI_B = `7${stamp}2`;
const HC_A = `E2E-${stamp}-A`;
const BUD = `PRE-E2E-${stamp}`;
const BUD2 = `PRE-E2E-${stamp}-B`;
const phase = (arg: 'block' | 'restore') =>
  JSON.parse(execSync(`node --conditions=react-server --import tsx scripts/e2e-import-phase.mts ${arg}`, { stdio: 'pipe' })
    .toString().trim().split('\n').pop()!) as { status: string; spCode: string | null };

const csv = (rows: string[][]) => Buffer.from('﻿' + rows.map((r) => r.join(';')).join('\r\n'), 'utf8');

const files = {
  doctors: csv([
    ['codigo', 'nombres', 'apellidos', 'cop', 'especialidad', 'correo', 'activo'],
    [DR, 'Rosa', `Prueba${stamp}`, `9${stamp}`, 'Ortodoncia', `rosa${stamp}@ejemplo.pe`, 'SI'],
  ]),
  services: csv([
    ['codigo', 'nombre', 'categoria', 'precio_base'],
    [SVC, `Resina E2E ${stamp}`, 'Operatoria', '100.00'],
  ]),
  patients: csv([
    ['hc', 'tipo_documento', 'numero_documento', 'nombres', 'apellido_paterno', 'apellido_materno', 'fecha_nacimiento', 'sexo', 'celular', 'antecedentes', 'titular_documento', 'titular_parentesco', 'apoderado_nombre', 'apoderado_parentesco'],
    [HC_A, 'DNI', DNI_A, 'Lucía', `Importada${stamp}`, 'Ramos', '21/07/1988', 'F', '987 654 321', 'Hipertensión', '', '', '', ''],
    ['', 'DNI', DNI_B, 'Tomás', `Importada${stamp}`, 'Ramos', '05/02/2016', 'M', '', '', DNI_A, 'Hijo(a)', `Lucía Importada${stamp} Ramos`, 'Madre'],
  ]),
  invalidPatients: csv([
    ['numero_documento', 'nombres', 'apellido_paterno', 'fecha_nacimiento'],
    [`8${stamp}1`, 'Válida', `Fila${stamp}`, '01/01/1990'],
    [`8${stamp}2`, '', `Fila${stamp}`, '31/02/1990'],
  ]),
  notes: csv([
    ['paciente_documento', 'fecha', 'doctor', 'nota', 'alergias', 'codigo_externo'],
    [DNI_A, '12/05/2025', DR, `Evolución importada ${stamp}: control de caries.`, 'Penicilina', `EV-${stamp}`],
  ]),
  appointments: csv([
    ['codigo_externo', 'paciente_documento', 'paciente_hc', 'doctor', 'fecha', 'hora_inicio', 'duracion_min', 'estado', 'motivo'],
    [`C1-${stamp}`, DNI_A, '', DR, '12/05/2025', '09:00', '45', 'Atendida', 'Historial'],
    [`C2-${stamp}`, '', HC_A, DR, '15/12/2026', '16:30', '30', '', 'Control'],
  ]),
  budget: csv([
    ['codigo_externo', 'paciente_documento', 'fecha', 'doctor', 'estado', 'descuento', 'codigo_servicio', 'pieza', 'superficies', 'cantidad', 'precio_unitario'],
    [BUD, DNI_A, '12/05/2025', DR, 'Aprobado', '10', SVC, '3.6', 'OD', '1', ''],
    [BUD, DNI_A, '12/05/2025', DR, 'Aprobado', '', SVC, '16', '', '2', '80'],
    [BUD2, DNI_A, '20/05/2025', DR, 'Borrador', '', SVC, '', '', '1', '50'],
  ]),
};

/** ZIP cuyo directorio central declara 100 bytes, pero la entrada se infla a 200 MB (bomba de compresión). */
function zipBomb() {
  const entries: [Buffer, Buffer, number][] = [
    [Buffer.from('xl/workbook.xml'), Buffer.from('<workbook/>'), 0],
    [Buffer.from('xl/worksheets/sheet1.xml'), deflateRawSync(Buffer.alloc(200 * 1024 * 1024)), 8],
  ];
  const parts: Buffer[] = []; const cd: Buffer[] = []; let off = 0;
  for (const [name, data, method] of entries) {
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(100, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(100, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, data); cd.push(ch, name); off += 30 + name.length + data.length;
  }
  const cdb = Buffer.concat(cd);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cdb.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cdb, eocd]);
}

const post = (page: Page, entity: string, name: string, buffer: Buffer, mimeType = 'text/csv') =>
  page.request.post('/api/import', { multipart: { entity, mode: 'validate', file: { name, mimeType, buffer } } });

async function openStep(page: Page, title: string) {
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
}

async function upload(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel('Archivo a importar').setInputFiles({ name, mimeType: 'text/csv', buffer });
  await page.getByRole('button', { name: 'Validar archivo' }).click();
  await expect(page.getByText('Resultado de la validación')).toBeVisible();
}

async function importValid(page: Page, rows: number) {
  await page.getByRole('button', { name: `Importar ${rows} fila${rows === 1 ? '' : 's'} válida${rows === 1 ? '' : 's'}` }).click();
  await expect(page.getByRole('heading', { name: 'Importación completada' })).toBeVisible({ timeout: 60_000 });
}

const stat = (page: Page, label: string) => page.locator('dl > div').filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd');

test.describe.serial('carga masiva (implementación)', () => {
  test.use({ extraHTTPHeaders: { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3100' } });

  test('menú y descarga de plantilla Excel con instrucciones y ejemplo', async ({ page }) => {
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Carga masiva' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Carga masiva' }).first()).toBeVisible();
    await expect(page.getByText('Orden de carga')).toBeVisible();

    await openStep(page, 'Pacientes');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Plantilla Excel' }).click()]);
    expect(download.suggestedFilename()).toBe('plantilla-5-pacientes.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await download.path());
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(['Datos', 'Ejemplo', 'Instrucciones', 'Valores']));
    expect(wb.getWorksheet('Datos')!.getRow(1).getCell(1).value).toBe('hc');
    expect(wb.getWorksheet('Ejemplo')!.rowCount).toBeGreaterThanOrEqual(3);
  });

  test('validación (sin guardar) muestra los errores por fila y columna', async ({ page }) => {
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');
    await openStep(page, 'Pacientes');
    await upload(page, 'pacientes-con-error.csv', files.invalidPatients);
    await expect(stat(page, 'Filas')).toHaveText('2');
    await expect(stat(page, 'Con error')).toHaveText('1');
    const errors = page.locator('table').filter({ hasText: 'Detalle' }).last();
    await expect(errors.getByText('Fecha inválida (usa DD/MM/AAAA)')).toBeVisible();
    await expect(errors.getByRole('cell', { name: 'Obligatorio', exact: true })).toBeVisible();
    await expect(errors.getByRole('cell', { name: 'fecha_nacimiento', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importar 1 fila válida' })).toBeVisible();
    const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar reporte de errores' }).click()]);
    expect(report.suggestedFilename()).toBe('errores-pacientes-con-error.csv');
    // Validar no guarda nada
    const r = await page.request.get(`/api/patients?q=8${stamp}1`);
    expect((await r.json()).total).toBe(0);
  });

  test('rechaza una bomba de compresión y archivos con demasiadas columnas', async ({ page }) => {
    const bomb = await post(page, 'PATIENTS', 'bomba.xlsx', zipBomb(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(bomb.status()).toBe(400);
    expect((await bomb.json()).error.code).toBe('IMPORT_INVALID_FILE');

    const wide = await post(page, 'PATIENTS', 'ancho.csv', Buffer.from(Array.from({ length: 150 }, (_, i) => `col${i}`).join(';') + '\nx'));
    expect(wide.status()).toBe(400);
    expect((await wide.json()).error.code).toBe('IMPORT_TOO_MANY_COLUMNS');
  });

  test('importa doctores, servicios, pacientes, historias, citas y un presupuesto', async ({ page }) => {
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');

    await openStep(page, 'Doctores');
    await upload(page, 'doctores.csv', files.doctors);
    await importValid(page, 1);

    await openStep(page, 'Lista de precios');
    await upload(page, 'servicios.csv', files.services);
    await importValid(page, 1);

    await openStep(page, 'Pacientes');
    await upload(page, 'pacientes.csv', files.patients);
    await expect(stat(page, 'Se crearán')).toHaveText('2');
    await importValid(page, 2);
    await expect(stat(page, 'Nuevos')).toHaveText('2');

    await openStep(page, 'Historias clínicas');
    await upload(page, 'historias.csv', files.notes);
    await importValid(page, 1);

    await openStep(page, 'Citas');
    await upload(page, 'citas.csv', files.appointments);
    await importValid(page, 2);

    await openStep(page, 'Presupuestos');
    await upload(page, 'presupuestos.csv', files.budget);
    await expect(stat(page, 'Se crearán')).toHaveText('2');
    await importValid(page, 3);

    // Historial de cargas
    await expect(page.getByRole('cell', { name: 'presupuestos.csv' }).first()).toBeVisible();

    // Paciente con su H.C. del sistema anterior, apoderado/titular e historia clínica
    const list = await (await page.request.get(`/api/patients?q=${DNI_A}`)).json();
    expect(list.total).toBe(1);
    const patientId = list.rows[0].id as string;
    expect(list.rows[0].record_number).toBe(HC_A);
    await page.goto(`/app/patients/${patientId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(`H.C. ${HC_A}`)).toBeVisible();
    await page.getByRole('tab', { name: 'Historia clínica' }).click();
    await expect(page.getByText(`Evolución importada ${stamp}: control de caries.`)).toBeVisible();
    await expect(page.getByText('Penicilina')).toBeVisible();
    await expect(page.getByText('Hipertensión')).toBeVisible();

    const kid = await (await page.request.get(`/api/patients?q=${DNI_B}`)).json();
    expect(kid.rows[0].requires_guardian).toBeTruthy();

    // Citas: la pasada (Atendida) y la futura (Programada por defecto)
    const appts = await (await page.request.get(`/api/appointments?from=2025-01-01T00:00:00Z&to=2027-01-01T00:00:00Z&patientId=${patientId}`)).json();
    expect(appts.map((a: { status_code: string }) => a.status_code).sort()).toEqual(['ATTENDED', 'SCHEDULED']);

    // Presupuesto aprobado: 100 (precio base) + 2 × 80 - 10 de descuento = 250; y un borrador de 50
    const budgets = await (await page.request.get(`/api/budgets?patientId=${patientId}`)).json();
    expect(budgets.total).toBe(2);
    const approved = budgets.rows.find((b: { status_code: string }) => b.status_code === 'APPROVED');
    expect(Number(approved.total)).toBe(250);
    expect(Number(budgets.rows.find((b: { status_code: string }) => b.status_code === 'DRAFT').total)).toBe(50);
  });

  test('volver a importar los mismos archivos no duplica', async ({ page }) => {
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');

    await openStep(page, 'Pacientes');
    await upload(page, 'pacientes.csv', files.patients);
    await expect(stat(page, 'Se crearán')).toHaveText('0');
    await expect(stat(page, 'Se actualizarán')).toHaveText('2');
    await importValid(page, 2);

    await openStep(page, 'Citas');
    await upload(page, 'citas.csv', files.appointments);
    await expect(stat(page, 'Se crearán')).toHaveText('0');
    await importValid(page, 2);

    await openStep(page, 'Presupuestos');
    await upload(page, 'presupuestos.csv', files.budget);
    // El aprobado ya fue emitido: no se modifica (advertencia); el borrador sí se actualiza
    await expect(stat(page, 'Se crearán')).toHaveText('0');
    await expect(stat(page, 'Se actualizarán')).toHaveText('1');
    await expect(page.getByText(`Presupuesto ${BUD} ya emitido (Aprobado): no se modifica`)).toBeVisible();
    await importValid(page, 3);

    const list = await (await page.request.get(`/api/patients?q=${DNI_A}`)).json();
    expect(list.total).toBe(1);
    const patientId = list.rows[0].id as string;
    const appts = await (await page.request.get(`/api/appointments?from=2025-01-01T00:00:00Z&to=2027-01-01T00:00:00Z&patientId=${patientId}`)).json();
    expect(appts).toHaveLength(2);
    const budgets = await (await page.request.get(`/api/budgets?patientId=${patientId}`)).json();
    expect(budgets.total).toBe(2);
    expect(Number(budgets.rows.find((b: { status_code: string }) => b.status_code === 'APPROVED').total)).toBe(250);
  });

  test('H.C. de 8 dígitos importada no bloquea el alta normal de pacientes', async ({ page }) => {
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');
    await openStep(page, 'Pacientes');
    await upload(page, 'hc-larga.csv', csv([
      ['hc', 'numero_documento', 'nombres', 'apellido_paterno'],
      [`9${stamp}1`, `6${stamp}1`, 'Larga', `Hc${stamp}`],
    ]));
    await importValid(page, 1);

    for (const n of [1, 2]) {
      await page.goto('/app/patients/new');
      await page.waitForLoadState('networkidle');
      await page.getByLabel('Nombres').fill(`Normal${n}`);
      await page.getByLabel('Apellidos').fill(`Despues${stamp}`);
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]{36}$/);
      await expect(page.getByText(/H\.C\. \d{6,7}$/)).toBeVisible();
    }
  });

  test('el reporte de errores neutraliza valores que parecen fórmulas', async ({ page }) => {
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');
    await openStep(page, 'Pacientes');
    await upload(page, 'formula.csv', csv([
      ['numero_documento', 'nombres', 'apellido_paterno', '=HYPERLINK("http://ejemplo.pe")'],
      ['', '', `Formula${stamp}`, 'x'],
    ]));
    const [report] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar reporte de errores' }).click()]);
    const text = readFileSync(await report.path(), 'utf8');
    expect(text).toContain("'=hyperlink");
    expect(text).not.toMatch(/(^|;)"?=hyperlink/m);
  });

  test('fuera de la implementación la carga masiva está bloqueada (también en el SP)', async ({ page }) => {
    try {
      const r = phase('block');
      expect(r.spCode).toBe('IMPORT_NOT_AVAILABLE');
      const res = await page.request.post('/api/import', { multipart: { entity: 'PATIENTS', mode: 'validate', file: { name: 'p.csv', mimeType: 'text/csv', buffer: files.patients } } });
      expect(res.status()).toBe(403);
      const tpl = await page.request.get('/api/import/template/pacientes');
      expect(tpl.status()).toBe(403);
      await page.goto('/app/import');
      await expect(page.getByRole('heading', { level: 2, name: 'Pacientes' })).toHaveCount(0);
    } finally {
      phase('restore');
    }
    await page.goto('/app/import');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Orden de carga')).toBeVisible();
  });
});
