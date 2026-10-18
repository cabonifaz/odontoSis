import { test as setup, expect } from '@playwright/test';

/** Inicia sesión con el administrador de la clínica demo y guarda la sesión para los demás tests. */
setup('login admin clínica demo', async ({ page }) => {
  const email = process.env.E2E_ADMIN_EMAIL ?? 'e2e@demo.odontosis.pe';
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) throw new Error('Define E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD (npm run db:e2e-user)');

  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL(/\/app/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.context().storageState({ path: 'playwright/.auth/admin.json' });
});
