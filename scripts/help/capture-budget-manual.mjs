/**
 * Genera las capturas del manual "Cómo crear un presupuesto" (public/help/presupuestos/*.png)
 * recorriendo la app real con datos de ejemplo y dibujando números sobre cada paso.
 *
 * Requisitos: servidor en http://localhost:3100 (npm run dev -- -p 3100) contra staging/desarrollo y la sesión
 * de pruebas (playwright/.auth/admin.json, se crea con `npx playwright test --project=setup`).
 * Uso: node scripts/help/capture-budget-manual.mjs
 */
import { mkdirSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const OUT = 'public/help/presupuestos';
const STATE = 'playwright/.auth/admin.json';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1.5, storageState: STATE, locale: 'es-PE', timezoneId: 'America/Lima' });
const page = await ctx.newPage();
const api = (method, path, data) => page.request.fetch(path, { method, data, headers: { Origin: new URL(BASE).origin } });

// ---------- Datos de ejemplo (idempotente) ----------
await page.goto('/app');
await page.evaluate(() => localStorage.setItem('odx:tours', 'off'));
async function ensureAgreement() {
  const list = await (await api('GET', '/api/agreements?all=1')).json();
  let a = list.find((x) => x.code === 'CIP');
  if (!a) {
    await api('POST', '/api/agreements', { id: crypto.randomUUID(), code: 'CIP', name: 'Colegio de Ingenieros del Perú', companyName: 'Colegio de Ingenieros del Perú', discountPct: 10, isActive: true });
    a = (await (await api('GET', '/api/agreements?all=1')).json()).find((x) => x.code === 'CIP');
  }
  return a.id;
}
async function ensurePatient(first, last, mother, extra = {}) {
  const found = await (await api('GET', `/api/patients?q=${encodeURIComponent(`${first} ${last}`)}`)).json();
  if (found.rows?.some((p) => p.first_name === first && p.last_name === last)) return;
  // Las altas viajan por la sincronización (la app trabaja primero en local)
  const payload = { id: crypto.randomUUID(), firstName: first, lastName: last, motherLastName: mother, birthDate: '1988-04-12', isActive: true, ...extra };
  const r = await api('POST', '/api/sync/push', { ops: [{ opId: crypto.randomUUID(), type: 'patient.save', payload }] });
  const res = await r.json();
  if (!r.ok() || res.results?.some((x) => !x.ok)) throw new Error(`No se creó ${first} ${last}: ${JSON.stringify(res)}`);
}
async function ensureDoctor() {
  const list = await (await api('GET', '/api/doctors')).json();
  if (!list.some((d) => d.first_name === 'Carmen' && d.last_name === 'Salazar Vega')) {
    await api('POST', '/api/doctors', { id: crypto.randomUUID(), firstName: 'Carmen', lastName: 'Salazar Vega', licenseNumber: '28457', agendaColor: '#7C3AED', isActive: true });
  }
}
await ensureDoctor();
const cip = await ensureAgreement();
await ensurePatient('María Elena', 'Quispe', 'Rojas', { mobile: '987654321' });
await ensurePatient('Jorge Luis', 'Huamán', 'Torres', { insuranceCompany: 'Pacífico Seguros', deductible: 30, coinsurancePct: 20 });
await ensurePatient('Rosa', 'Mendoza', 'Paredes', { agreementId: cip, agreementMemberCode: 'CIP-48213' });

// ---------- Utilidades de captura ----------
/** Dibuja un recuadro y un número sobre cada elemento (coordenadas del documento) */
async function annotate(items) {
  await page.evaluate((items) => {
    document.querySelectorAll('.odx-ann').forEach((n) => n.remove());
    for (const it of items) {
      const el = typeof it.sel === 'string' ? document.querySelector(it.sel) : null;
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = 'odx-ann';
      Object.assign(box.style, { position: 'absolute', zIndex: 9999, pointerEvents: 'none', left: `${Math.max(2, r.left + scrollX - 6)}px`, top: `${Math.max(2, r.top + scrollY - 6)}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`, border: '3px solid #EA580C', borderRadius: '12px', boxShadow: '0 0 0 4px rgb(234 88 12 / .18)' });
      const n = document.createElement('div');
      n.className = 'odx-ann';
      n.textContent = String(it.n);
      Object.assign(n.style, { position: 'absolute', zIndex: 10000, pointerEvents: 'none', left: `${Math.max(4, r.left + scrollX - 18)}px`, top: `${Math.max(4, r.top + scrollY - 18)}px`, width: '30px', height: '30px', borderRadius: '999px', background: '#EA580C', color: '#fff', font: '700 15px/30px system-ui, sans-serif', textAlign: 'center', boxShadow: '0 2px 6px rgb(0 0 0 / .3)' });
      document.body.append(box, n);
    }
  }, items);
}
/** La barra «Guardar» es fija abajo: en capturas de página completa taparía el contenido */
const unstick = (on = true) => page.evaluate((on) => {
  let st = document.getElementById('odx-unstick');
  if (on && !st) { st = document.createElement('style'); st.id = 'odx-unstick'; st.textContent = '.sticky{position:static!important}'; document.head.append(st); }
  if (!on) st?.remove();
}, on);
const clear = () => page.evaluate(() => document.querySelectorAll('.odx-ann').forEach((n) => n.remove()));

/** Captura la zona que cubre los selectores dados (con margen), en coordenadas del documento */
async function shot(name, sels, margin = 28) {
  const box = await page.evaluate(({ sels, margin }) => {
    const rs = sels.map((s) => document.querySelector(s)?.getBoundingClientRect()).filter(Boolean);
    const x = Math.max(0, Math.min(...rs.map((r) => r.left)) + scrollX - margin);
    const y = Math.max(0, Math.min(...rs.map((r) => r.top)) + scrollY - margin);
    const x2 = Math.min(document.documentElement.scrollWidth, Math.max(...rs.map((r) => r.right)) + scrollX + margin);
    const y2 = Math.max(...rs.map((r) => r.bottom)) + scrollY + margin;
    return { x, y, width: x2 - x, height: y2 - y };
  }, { sels, margin });
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, clip: box, animations: 'disabled' });
  console.log('✓', name);
}
async function pickCombo(scopeSel, text, optionText) {
  const input = page.locator(`${scopeSel} [role=combobox]`);
  await input.click();
  await input.fill(text);
  await page.getByRole('option', { name: optionText }).first().waitFor();
  return input;
}
async function chooseOption(optionText) { await page.getByRole('option', { name: optionText }).first().click(); }
async function surface(tooth, s, p = page) {
  const idx = await p.evaluate(({ tooth, s }) => {
    const polys = Array.from(document.querySelectorAll(`[data-tooth="${tooth}"] polygon`));
    return polys.findIndex((el) => el.querySelector('title')?.textContent?.trim().endsWith(`· ${s}`));
  }, { tooth, s });
  if (idx < 0) throw new Error(`Superficie ${s} de la pieza ${tooth} no encontrada`);
  await p.locator(`[data-tooth="${tooth}"] polygon`).nth(idx).click();
}
async function synced() { await page.getByText('Sincronizado').first().waitFor({ timeout: 30_000 }); }

// 1) Menú y botón Nuevo presupuesto
await page.goto('/app/budgets');
await page.waitForLoadState('networkidle');
await synced();
await page.locator('[data-tour="budget-list"]').getByText('Cargando').waitFor({ state: 'detached' });
await annotate([{ sel: 'aside a[href="/app/budgets"]', n: 1 }, { sel: '[data-tour="new-budget"]', n: 2 }]);
await page.screenshot({ path: `${OUT}/01-inicio.png`, animations: 'disabled' });
console.log('✓ 01-inicio');
await clear();

// 2) Paciente
await page.goto('/app/budgets/new');
await page.waitForLoadState('networkidle');
await page.locator('[data-tour="patient"] [role=combobox]').waitFor();
await pickCombo('[data-tour="patient"]', 'Quispe', /Quispe Rojas, María Elena/);
await annotate([{ sel: '[data-tour="patient"]', n: 1 }]);
await shot('02-paciente', ['[data-tour="patient"]', '[role=listbox]'], 40);
await chooseOption(/Quispe Rojas, María Elena/);
await clear();

// 3) Datos: doctor, fecha, seguro, convenio, estado
await page.getByLabel('Doctor tratante').selectOption({ label: 'Carmen Salazar Vega' });
await unstick();
await annotate([{ sel: '[data-tour="doctor"]', n: 1 }, { sel: '[data-tour="date"]', n: 2 }, { sel: '[data-tour="insurance"]', n: 3 }, { sel: '[data-tour="agreement"]', n: 4 }, { sel: '[data-tour="status"]', n: 5 }]);
await shot('03-datos', ['[data-tour="budget-header"]'], 8);
await clear();

// 4) Odontograma: pieza 1.6, superficies O y M
await surface('1.6', 'O');
await surface('1.6', 'M');
await annotate([{ sel: '[data-tooth="1.6"]', n: 1 }, { sel: '[data-tour="selection"]', n: 2 }]);
await shot('04-odontograma', ['[data-tour="odontogram"]', '[data-tour="add-treatment"]']);
await clear();

// 5) Tratamiento
await pickCombo('[data-tour="service"]', 'resina mod', /RESINA MODERADA/i);
await annotate([{ sel: '[data-tour="service"]', n: 1 }, { sel: '[data-tour="add-buttons"]', n: 2 }]);
await shot('05-tratamiento', ['[data-tour="add-treatment"]', '[role=listbox]']);
await chooseOption(/RESINA MODERADA/i);
await page.getByRole('button', { name: 'Agregar a pieza' }).click();
await clear();
// Más tratamientos: pieza 4.6 completa (clic en el número) y un tratamiento general
await page.locator('[data-tooth="4.6"] text').click();
await pickCombo('[data-tour="service"]', 'extraccion simple', /EXTRACCION SIMPLE/i);
await chooseOption(/EXTRACCION SIMPLE/i);
await page.getByRole('button', { name: 'Agregar a pieza' }).click();
await pickCombo('[data-tour="service"]', 'examen con', /EXAMEN CON ODONTOGRAMA/i);
await chooseOption(/EXAMEN CON ODONTOGRAMA/i);
await page.getByRole('button', { name: 'General' }).click();
await page.getByLabel('Descuento').fill('20');
await page.getByLabel('Observaciones').fill('Tratamiento en 2 citas. Incluye control a los 15 días.');

// 6) Tabla de tratamientos y totales
await annotate([{ sel: '[data-tour="items"] table', n: 1 }, { sel: 'input[aria-label="Descuento"]', n: 2 }, { sel: '[data-tour="totals"] > div:last-of-type', n: 3 }]);
await shot('06-tratamientos', ['[data-tour="items"]']);
await clear();

// 4b) Odontograma con piezas planificadas
await shot('04b-planificado', ['[data-tour="odontogram"]'], 16);

// 7) Guardar
await unstick(false);
await page.locator('[data-tour="save"]').scrollIntoViewIfNeeded();
await annotate([{ sel: '[data-tour="save"]', n: 1 }]);
await page.screenshot({ path: `${OUT}/07-guardar.png`, animations: 'disabled', clip: { x: 0, y: 900 - 170, width: 1366, height: 170 } });
console.log('✓ 07-guardar');
await clear();
await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
await page.waitForURL(/\/app\/budgets\/[0-9a-f-]{36}$/);
await page.waitForLoadState('networkidle');

// 8) Presupuesto guardado: estado, imprimir, editar
await page.locator('[data-tour="budget-document"]').waitFor();
await annotate([{ sel: '[data-tour="budget-status"]', n: 1 }, { sel: '[data-tour="budget-print"]', n: 2 }, { sel: '[data-tour="budget-edit"]', n: 3 }]);
await page.screenshot({ path: `${OUT}/08-guardado.png`, animations: 'disabled', clip: { x: 256, y: 0, width: 1110, height: 330 } });
console.log('✓ 08-guardado');
await clear();

// 9) Documento que recibe el paciente
await page.emulateMedia({ media: 'print' });
await page.locator('[data-tour="budget-document"]').screenshot({ path: `${OUT}/09-documento.png`, animations: 'disabled' });
console.log('✓ 09-documento');
await page.emulateMedia({ media: 'screen' });

// 10) Ejemplo con seguro
await page.goto('/app/budgets/new');
await page.waitForLoadState('networkidle');
await pickCombo('[data-tour="patient"]', 'Huamán', /Huamán Torres, Jorge Luis/);
await chooseOption(/Huamán Torres, Jorge Luis/);
await page.getByLabel('Doctor tratante').selectOption({ label: 'Carmen Salazar Vega' });
await unstick();
await surface('2.6', 'O');
await pickCombo('[data-tour="service"]', 'resina simple', /RESINA SIMPLE/i);
await chooseOption(/RESINA SIMPLE/i);
await page.getByRole('button', { name: 'Agregar a pieza' }).click();
await page.locator('[data-tooth="3.6"] text').click();
await pickCombo('[data-tour="service"]', 'pulpectomia', /PULPECTOMIA/i);
await chooseOption(/PULPECTOMIA/i);
await page.getByRole('button', { name: 'Agregar a pieza' }).click();
await annotate([{ sel: '[data-tour="insurance"]', n: 1 }, { sel: '[data-tour="items"] table', n: 2 }, { sel: '[data-tour="totals"]', n: 3 }]);
await shot('10-seguro-datos', ['[data-tour="budget-header"]'], 8);
await shot('10-seguro', ['[data-tour="items"]']);
await clear();

// 11) Ejemplo con convenio
await page.goto('/app/budgets/new');
await page.waitForLoadState('networkidle');
await pickCombo('[data-tour="patient"]', 'Mendoza', /Mendoza Paredes, Rosa/);
await chooseOption(/Mendoza Paredes, Rosa/);
await page.getByLabel('Doctor tratante').selectOption({ label: 'Carmen Salazar Vega' });
await unstick();
await surface('1.1', 'V');
await surface('1.1', 'M');
await pickCombo('[data-tour="service"]', 'resina comp', /RESINA COMPLEJA/i);
await chooseOption(/RESINA COMPLEJA/i);
await page.getByRole('button', { name: 'Agregar a pieza' }).click();
await pickCombo('[data-tour="service"]', 'examen con', /EXAMEN CON ODONTOGRAMA/i);
await chooseOption(/EXAMEN CON ODONTOGRAMA/i);
await page.getByRole('button', { name: 'General' }).click();
await annotate([{ sel: '[data-tour="agreement"]', n: 1 }, { sel: '[data-tour="totals"] > div:first-child', n: 2 }]);
await shot('11-convenio-datos', ['[data-tour="budget-header"]'], 8);
await shot('11-convenio', ['[data-tour="items"]']);
await clear();

// 12) Guía paso a paso dentro de la pantalla
await page.evaluate(() => localStorage.removeItem('odx:tours'));
await page.getByRole('button', { name: '¿Cómo se hace?' }).click();
for (let i = 0; i < 5; i++) await page.getByRole('button', { name: /Siguiente/ }).click();
await unstick(false);
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/12-guia.png`, animations: 'disabled' });
console.log('✓ 12-guia');
await page.keyboard.press('Escape');
await page.evaluate(() => localStorage.setItem('odx:tours', 'off'));

// 13) Celular
const m = await browser.newContext({ ...devices['Pixel 7'], baseURL: BASE, storageState: STATE, locale: 'es-PE', timezoneId: 'America/Lima' });
const mp = await m.newPage();
await mp.goto('/app');
await mp.evaluate(() => localStorage.setItem('odx:tours', 'off'));
await mp.goto('/app/budgets/new');
await mp.waitForLoadState('networkidle');
await mp.locator('[data-tour="patient"] [role=combobox]').fill('Quispe');
await mp.getByRole('option', { name: /Quispe Rojas, María Elena/ }).first().click();
await mp.screenshot({ path: `${OUT}/13-celular.png`, animations: 'disabled' });
console.log('✓ 13-celular');

await browser.close();
