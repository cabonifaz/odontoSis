import { expect, test } from '@playwright/test';

const stamp = Date.now().toString().slice(-6);

/** Maestro de convenios con muchos registros: búsqueda sin tildes, filtro por estado y paginación. */
test('busca convenios por nombre, código o empresa', async ({ page }) => {
  await page.goto('/app');
  const origin = new URL(page.url()).origin;
  const mk = (code: string, name: string, companyName: string, isActive = true) =>
    page.request.post('/api/agreements', { headers: { Origin: origin }, data: { id: crypto.randomUUID(), code, name, companyName, discountPct: 10, isActive } });
  for (const r of await Promise.all([
    mk(`CLUBR${stamp}`, `Club Regatas ${stamp}`, 'Club de Regatas Lima'),
    mk(`COLEG${stamp}`, `Colegio Médico ${stamp}`, 'Colegio Médico del Perú'),
    mk(`INACT${stamp}`, `Inactivo ${stamp}`, 'Empresa Vieja', false),
  ])) expect(r.ok()).toBeTruthy();

  await page.goto('/app/agreements');
  const search = page.getByLabel('Buscar convenio');
  await search.fill(`medico ${stamp}`); // sin tilde y en otro orden
  await expect(page.getByText(`Colegio Médico ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Club Regatas ${stamp}`)).toHaveCount(0);

  await search.fill(`CLUBR${stamp}`); // por código
  await expect(page.getByText(`Club Regatas ${stamp}`)).toBeVisible();

  await search.fill(stamp);
  await page.getByRole('tab', { name: /^Inactivos/ }).click();
  await expect(page.getByText(`Inactivo ${stamp}`)).toBeVisible();
  await expect(page.getByText(`Club Regatas ${stamp}`)).toHaveCount(0);

  await page.getByRole('tab', { name: /^Todos/ }).click();
  await search.fill('zzz-no-existe');
  await expect(page.getByText('Sin resultados')).toBeVisible();
});

/** Avatar y apodo desde el menú (un toque divertido) */
test('personaliza avatar y apodo desde el menú', async ({ page }) => {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Personalizar avatar y apodo' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Personaliza tu perfil' });
  await dialog.getByRole('radio', { name: 'Llama' }).click();
  await dialog.getByRole('textbox', { name: 'Apodo' }).fill(`Doc Pruebas ${stamp}`);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Doc Pruebas ${stamp}`);
  await expect(page.getByRole('button', { name: 'Personalizar avatar y apodo' }).first()).toContainText('🦙');
});
