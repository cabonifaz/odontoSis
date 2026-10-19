import { expect, test } from '@playwright/test';

/** Manual de presupuestos y guía paso a paso sobre la pantalla */
test.describe('ayuda y guías en pantalla', () => {
  test('el manual muestra los pasos con sus capturas', async ({ page }) => {
    await page.goto('/app/help');
    await page.getByRole('link', { name: /Cómo crear un presupuesto/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cómo crear un presupuesto' })).toBeVisible();
    for (const id of ['paso-1', 'paso-2', 'paso-3', 'paso-4', 'ejemplos', 'preguntas']) await expect(page.locator(`#${id}`)).toBeAttached();
    const imgs = page.locator('article img');
    expect(await imgs.count()).toBeGreaterThanOrEqual(12);
    const first = imgs.first();
    await first.scrollIntoViewIfNeeded();
    await expect.poll(() => first.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  });

  test('«Practicar con la guía» abre el presupuesto con la guía y se puede recorrer', async ({ page }) => {
    await page.goto('/app/help/presupuestos');
    await page.getByRole('link', { name: /Practicar con la guía/ }).first().click();
    const card = page.getByRole('dialog', { name: 'Crear un presupuesto en 4 pasos' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Siguiente/ }).click();
    const step2 = page.getByRole('dialog', { name: '① Busca al paciente' });
    await expect(step2).toBeVisible();
    await expect(step2.getByText(/Paso 2 de/)).toBeVisible();
    // El elemento resaltado es el buscador de pacientes y la tarjeta no lo tapa
    const target = await page.locator('[data-tour="patient"]').boundingBox();
    const box = await step2.boundingBox();
    expect(target && box).toBeTruthy();
    const overlap = !(box!.x > target!.x + target!.width || box!.x + box!.width < target!.x || box!.y > target!.y + target!.height || box!.y + box!.height < target!.y);
    expect(overlap).toBe(false);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('dialog', { name: 'Doctor tratante y fecha' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Doctor tratante y fecha' })).toHaveCount(0);
    // «¿Cómo se hace?» la vuelve a abrir desde el inicio
    await page.getByRole('button', { name: '¿Cómo se hace?' }).click();
    await expect(page.getByRole('dialog', { name: 'Crear un presupuesto en 4 pasos' })).toBeVisible();
  });

  test('la guía se abre sola la primera vez y luego ya no', async ({ page }) => {
    await page.goto('/app');
    await page.evaluate(() => { localStorage.removeItem('odx:tours'); Object.keys(localStorage).filter((k) => k.startsWith('odx:tour:')).forEach((k) => localStorage.removeItem(k)); });
    await page.goto('/app/budgets');
    const step = page.getByRole('dialog', { name: 'Nuevo presupuesto' });
    await expect(step).toBeVisible();
    await step.getByRole('button', { name: /Siguiente/ }).click();
    await page.getByRole('button', { name: 'Entendido' }).click();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1200);
    await expect(page.getByRole('dialog', { name: 'Nuevo presupuesto' })).toHaveCount(0);
  });
});
