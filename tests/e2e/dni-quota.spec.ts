import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';

/** Cupo mensual de consultas de DNI: registra cada consulta al proveedor, la caché no consume y al agotarse no se llama al proveedor. */
const quota = (arg = '') =>
  JSON.parse(execSync(`node --conditions=react-server --import tsx scripts/e2e-set-dni-quota.mts ${arg}`, { stdio: 'pipe' }).toString().trim().split('\n').pop()!) as { used: number; quota: number };
const dni = () => String(10_000_000 + Math.floor(Math.random() * 89_999_999)).slice(0, 8);

test.describe('consulta de DNI con cupo', () => {
  test.afterAll(() => { quota('100'); });

  test('cuenta consultas, respeta caché y bloquea al agotar el cupo', async ({ page }) => {
    await page.goto('/app');
    const check = await page.request.get('/api/identity/dni?check=1');
    test.skip(!(await check.json()).enabled, 'El servidor de pruebas no tiene DNI_API_TOKEN (simulador)');

    quota('100');
    const before = quota().used;
    const a = dni();
    const r1 = await page.request.get(`/api/identity/dni?numero=${a}`);
    expect(r1.status()).toBe(200);
    expect((await r1.json()).firstName).toBe('ANA LUCIA');
    expect(quota().used).toBe(before + 1);

    // Repetir el mismo DNI sale de caché: no consume
    expect((await page.request.get(`/api/identity/dni?numero=${a}`)).status()).toBe(200);
    expect(quota().used).toBe(before + 1);

    // DNI sin datos también consume (el proveedor lo cobra)
    const nf = await page.request.get('/api/identity/dni?numero=99999999');
    expect(nf.status()).toBe(404);
    expect(quota().used).toBe(before + 2);

    // Cupo agotado: no se llama al proveedor y se avisa
    quota('used');
    const blocked = await page.request.get(`/api/identity/dni?numero=${dni()}`);
    expect(blocked.status()).toBe(429);
    expect((await blocked.json()).error.code).toBe('DNI_QUOTA_EXCEEDED');
    expect(quota().used).toBe(before + 2);
    // Lo que ya está en caché sigue disponible
    expect((await page.request.get(`/api/identity/dni?numero=${a}`)).status()).toBe(200);
  });
});
