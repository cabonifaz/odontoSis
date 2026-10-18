import { test, expect } from '@playwright/test';

const stamp = Date.now().toString().slice(-6);
const firstName = `E2E${stamp}`;

test.describe.serial('flujo clínico', () => {
  test('registra un paciente', async ({ page }) => {
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Nombres').fill(firstName);
    await page.getByLabel('Apellidos').fill('Prueba Automatizada');
    await page.getByLabel('N° de documento').fill(`7${stamp}12`);
    await page.getByLabel('Teléfono').fill('999 000 111');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(firstName);
    await expect(page.getByText(/H\.C\. \d{6}/)).toBeVisible();
  });

  test('crea un presupuesto con odontograma', async ({ page }) => {
    await page.goto('/app/budgets/new');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Buscar paciente por nombre o H.C.').fill(firstName);
    await page.getByRole('listbox').getByRole('option').first().click();

    // Selecciona la pieza 4.6 completa (clic en el número) y agrega un tratamiento
    await page.locator('[data-tooth="4.6"] text').click();
    await page.getByPlaceholder('Buscar en la lista de precios').fill('EXTRACCION COMPLEJA');
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('button', { name: 'Agregar a pieza' }).click();

    // Hallazgo: extracción indicada en 4.6
    await page.getByRole('radio', { name: 'Extracción indicada' }).click();
    await page.locator('[data-tooth="4.6"] text').click();

    // Tratamiento general
    await page.getByRole('radio', { name: 'Seleccionar pieza' }).click();
    await page.getByPlaceholder('Buscar en la lista de precios').fill('EXAMEN CON ODONTOGRAMA');
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('button', { name: 'General' }).click();

    await expect(page.getByText('Total a cancelar')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
    await expect(page).toHaveURL(/\/app\/budgets\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'ODONTOGRAMA' })).toBeVisible();
    await expect(page.getByText('TOTAL A CANCELAR')).toBeVisible();
    // 165 (extracción compleja) + 50 (examen) = 215
    await expect(page.getByText(/S\/ 215\.00/).first()).toBeVisible();
  });

  test('agenda una cita y detecta choque de horario', async ({ page }) => {
    await page.goto('/app/agenda');
    await page.waitForLoadState('networkidle');
    // Fecha futura única para no chocar con corridas anteriores
    const d = new Date(Date.now() + (20 + (Number(stamp) % 300)) * 86_400_000).toISOString().slice(0, 10);
    const create = async () => {
      await page.getByRole('button', { name: 'Nueva cita' }).first().click();
      await page.getByPlaceholder('Buscar paciente por nombre o H.C.').fill(firstName);
      await page.getByRole('listbox').getByRole('option').first().click();
      await page.getByLabel('Doctor').last().selectOption({ label: 'Ana Torres' });
      await page.getByLabel('Fecha').fill(d);
      await page.getByLabel('Hora').fill('20:00');
      await page.getByRole('button', { name: 'Guardar' }).click();
    };
    await create();
    await expect(page.getByText('Cita guardada.')).toBeVisible();
    await create();
    await expect(page.getByRole('alert').filter({ hasText: 'ya tiene una cita' })).toBeVisible();
  });
});
