import { test, expect } from '@playwright/test';

/** En móvil: menú lateral como drawer y sin scroll horizontal en las pantallas principales. */
for (const path of ['/app', '/app/patients', '/app/budgets', '/app/agenda', '/app/services']) {
  test(`sin scroll horizontal en ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('menú móvil', async ({ page }) => {
  await page.goto('/app');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('dialog', { name: 'Menú' }).getByRole('link', { name: 'Pacientes' }).click();
  await expect(page).toHaveURL(/\/app\/patients/);
});
