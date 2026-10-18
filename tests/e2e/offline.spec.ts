import { test, expect } from '@playwright/test';

/**
 * Trabajo sin conexión: el paciente creado offline queda en la cola (IndexedDB)
 * y se sincroniza automáticamente al reconectar.
 */
test('alta de paciente sin conexión y sincronización al reconectar', async ({ page, context }) => {
  const name = `Offline${Date.now().toString().slice(-6)}`;
  await page.goto('/app/patients');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Sincronizado')).toBeVisible();

  // Navegación cliente a "nuevo" y corte de red
  await page.getByRole('link', { name: 'Nuevo paciente' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo paciente' })).toBeVisible();
  await expect(page.getByLabel('Nombres')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);

  await page.getByLabel('Nombres').fill(name);
  await page.getByLabel('Apellidos').fill('Sin Conexión');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(/Guardado sin conexión/)).toBeVisible();
  await expect(page.getByText(/pendiente\(s\)|Sin conexión/).first()).toBeVisible();

  // Vuelve al listado (datos locales disponibles sin red)
  await expect(page).toHaveURL(/\/app\/patients$/);
  // La lista muestra 50 por página: se busca por nombre (búsqueda local, sin red)
  await page.getByPlaceholder(/Buscar por nombre/).fill(name);
  await expect(page.getByText(name)).toBeVisible();

  // Reconexión -> se envía la cola
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('Sincronizado')).toBeVisible({ timeout: 30_000 });

  // Confirmación contra el servidor
  const res = await page.request.get(`/api/patients?q=${name}`);
  const body = await res.json();
  expect(body.total).toBe(1);
  expect(body.rows[0].record_number).toMatch(/^\d{6}$/);
});
