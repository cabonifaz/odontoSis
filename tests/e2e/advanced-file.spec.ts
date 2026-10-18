import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const setMode = (m: 'ADVANCED' | 'STANDARD') =>
  execSync(`node --conditions=react-server --import tsx scripts/e2e-set-form-mode.mts ${m}`, { stdio: 'pipe' });
const stamp = Date.now().toString().slice(-6);

/** Ficha avanzada (clínica grande): campos, ubigeo, tarifario, menú completo, dependientes y cumpleaños. */
test.describe.serial('ficha avanzada', () => {
  test.use({ extraHTTPHeaders: { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3100' } });
  test.beforeAll(() => setMode('ADVANCED'));
  test.afterAll(() => setMode('STANDARD'));

  test('alta con ficha avanzada y menú completo', async ({ page }) => {
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Ficha avanzada')).toBeVisible();

    // Campos obligatorios de la ficha avanzada
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Ingresa el celular').first()).toBeVisible();

    await page.getByLabel('Apellido paterno').fill(`Avanzado${stamp}`);
    await page.getByLabel('Apellido materno').fill('Prueba');
    await page.getByLabel('Nombre(s)').fill('Carla');
    await page.getByLabel('Sexo').selectOption({ label: 'Femenino' });
    // hoy cumple años: debe aparecer en el dashboard
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
    await page.getByLabel('Fecha de nacimiento').fill(`1990-${today.slice(5)}`);
    await page.getByLabel('Celular').fill('987 111 222');
    await page.getByLabel('Captación (¿cómo nos conoció?)').selectOption({ label: 'Instagram' });
    await page.getByLabel('Distrito').waitFor();
    await page.getByLabel('Provincia').selectOption({ label: 'LIMA' });
    await page.getByLabel('Distrito').selectOption({ label: 'MIRAFLORES' });
    await page.getByLabel(/^Doctor/).selectOption({ label: 'Ana Torres' });
    await page.getByLabel('Asignación (tipo de atención)').selectOption({ label: 'Ortodoncia' });
    await page.getByLabel('Elige plan').selectOption({ label: 'Particular' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]{36}$/);

    for (const t of ['Datos personales', 'Dependientes', 'Derivaciones', 'Citas', 'Imágenes y archivos', 'Presupuestos operatorias', 'Presupuestos de ortodoncia', 'Carta de garantía']) {
      await expect(page.getByRole('tab', { name: t })).toBeVisible();
    }
    await expect(page.getByText('LIMA / LIMA / MIRAFLORES')).toBeVisible();
    await expect(page.getByText('Instagram')).toBeVisible();

    // Dependiente desde el titular
    await page.getByRole('tab', { name: 'Dependientes' }).click();
    await page.getByRole('button', { name: 'Agregar dependiente' }).click();
    await expect(page.getByRole('heading', { name: 'Nuevo dependiente' })).toBeVisible();
  });

  test('cumpleaños del día en el dashboard', async ({ page }) => {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Cumpleaños de pacientes')).toBeVisible();
    await expect(page.getByText(`Carla Avanzado${stamp}`)).toBeVisible();
  });

  test('tarifario: precio propio del servicio en el presupuesto', async ({ page, request }) => {
    const lists = await (await request.get('/api/price-lists')).json();
    const particular = lists.find((l: { code: string }) => l.code === 'PARTICULAR');
    const items = await (await request.get(`/api/price-lists/${particular.id}`)).json();
    const exam = items.find((i: { name: string }) => i.name === 'EXAMEN CON ODONTOGRAMA');
    expect((await request.put(`/api/price-lists/${particular.id}`, { data: { serviceId: exam.service_id, price: 45 } })).ok()).toBeTruthy();
    try {
      await page.goto('/app/budgets/new');
      await page.waitForLoadState('networkidle');
      await page.getByPlaceholder('Buscar paciente por nombre o H.C.').fill(`Avanzado${stamp}`);
      await page.getByRole('listbox').getByRole('option').first().click();
      await page.getByPlaceholder('Buscar en la lista de precios').fill('EXAMEN CON ODONTOGRAMA');
      await page.getByRole('listbox').getByRole('option').first().click();
      await page.getByRole('button', { name: 'General' }).click();
      await expect(page.getByLabel('Precio unitario')).toHaveValue('45');
    } finally {
      await request.put(`/api/price-lists/${particular.id}`, { data: { serviceId: exam.service_id, price: null } });
    }
  });
});
