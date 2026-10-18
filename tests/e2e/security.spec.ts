import { test, expect } from '@playwright/test';

test.describe('seguridad', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('cabeceras de seguridad y CSP con nonce', async ({ request }) => {
    const res = await request.get('/login');
    const h = res.headers();
    expect(h['content-security-policy']).toContain("script-src 'self' 'nonce-");
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('API sin sesión responde 401', async ({ request }) => {
    for (const path of ['/api/patients', '/api/sync/pull', '/api/admin/tenants', '/api/users']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
  });

  test('POST con Origin ajeno es rechazado (CSRF)', async ({ request }) => {
    const res = await request.post('/api/auth/login', {
      headers: { Origin: 'https://evil.example.com' },
      data: { email: 'x@y.com', password: 'x' },
    });
    expect(res.status()).toBe(403);
  });

  test('login inválido no revela si la cuenta existe', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Correo electrónico').fill('noexiste@demo.odontosis.pe');
    await page.getByLabel('Contraseña').fill('Incorrecta123!');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'incorrectos' })).toHaveText('Correo o contraseña incorrectos.');
  });

  test('rutas privadas redirigen al login', async ({ page }) => {
    await page.goto('/app/patients');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('aislamiento y permisos', () => {
  test('usuario de clínica no accede a la administración de plataforma', async ({ request }) => {
    const res = await request.get('/api/admin/tenants');
    expect(res.status()).toBe(403);
  });

  test('id inexistente / de otra clínica devuelve 404', async ({ request }) => {
    const res = await request.get(`/api/patients/${crypto.randomUUID()}`);
    expect(res.status()).toBe(404);
  });
});
