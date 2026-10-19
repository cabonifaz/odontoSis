import { expect, test } from '@playwright/test';
import { execSync } from 'node:child_process';

const stamp = Date.now().toString().slice(-6);
const origin = (url: string) => new URL(url).origin;

/** Notificaciones (campana y contadores del menú) y alertas de presupuestos que vencen hoy */
test.describe('notificaciones y pendientes del día', () => {
  test('la respuesta de la plataforma llega a la campana y al menú de la clínica', async ({ page }) => {
    await page.goto('/app');
    const id = crypto.randomUUID();
    const r = await page.request.post('/api/requests', { headers: { Origin: origin(page.url()) },
      data: { id, typeCode: 'QUESTION', title: `Consulta notif ${stamp}`, description: '¿Cómo imprimo un presupuesto?', attachmentIds: [] } });
    expect(r.ok()).toBeTruthy();

    // El super admin recibió aviso de la solicitud nueva y la atiende
    const out = JSON.parse(execSync(`node --conditions=react-server --import tsx scripts/e2e-attend-request.mts ${id} DONE`, { stdio: 'pipe' }).toString().trim().split('\n').pop()!);
    expect(out.superAdminNotified).toBe(true);

    await page.reload();
    await page.waitForLoadState('networkidle');
    const bell = page.getByRole('button', { name: /^Notificaciones: \d+ sin leer/ });
    await expect(bell).toBeVisible();
    await expect(page.locator('aside').getByRole('link', { name: /Soporte y mejoras/ }).getByLabel(/sin leer/)).toBeVisible();

    await bell.click();
    const item = page.getByRole('dialog', { name: 'Notificaciones' }).getByRole('button', { name: new RegExp(`Tu solicitud fue atendida.*Consulta notif ${stamp}`, 's') });
    await expect(item).toBeVisible();
    await item.click();
    await page.waitForURL((u) => u.pathname === '/app/requests' && u.searchParams.get('highlight') === id);
    const row = page.locator(`#req-${id}`);
    await expect(row.getByText('Respuesta nueva')).toBeVisible();
    await expect(row.getByText('Listo: ya puedes imprimir')).toBeVisible();
    // Ya leída: el contador del menú desaparece
    await expect(page.locator('aside').getByRole('link', { name: /Soporte y mejoras/ }).getByLabel(/sin leer/)).toHaveCount(0);
  });

  test('presupuestos que vencen hoy: alerta, filtro y contador en el menú', async ({ page }) => {
    await page.goto('/app/budgets');
    await page.waitForLoadState('networkidle');
    const o = origin(page.url());
    const patients = await (await page.request.get('/api/patients?limit=1')).json();
    const patientId = patients.rows[0].id;
    // Presupuesto de hoy para conocer la vigencia de la clínica; luego uno fechado para que venza hoy
    const probeId = crypto.randomUUID();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
    const item = { id: crypto.randomUUID(), toothCode: null, surfaces: null, serviceId: null, description: `Control ${stamp}`, quantity: 1, unitPrice: 50, deductible: 0, coinsurance: 0 };
    const push = (id: string, budgetDate: string) => page.request.post('/api/sync/push', { headers: { Origin: o }, data: { ops: [{ opId: crypto.randomUUID(), type: 'budget.save',
      payload: { id, patientId, doctorId: null, budgetDate, statusCode: 'DRAFT', insuranceCompany: null, deductible: 0, coinsurancePct: 0, discount: 0, agreementId: null, branchId: null, priceListId: null, notes: null, items: [{ ...item, id: crypto.randomUUID() }], marks: [] } }] } });
    expect((await push(probeId, today)).ok()).toBeTruthy();
    const probe = await (await page.request.get(`/api/budgets/${probeId}`)).json();
    const days = Math.round((Date.parse(probe.valid_until.slice(0, 10)) - Date.parse(today)) / 86_400_000);
    const start = new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
    const dueId = crypto.randomUUID();
    expect((await push(dueId, start)).ok()).toBeTruthy();

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('alert').filter({ hasText: /vencen? hoy/ })).toBeVisible();
    await expect(page.locator('aside').getByRole('link', { name: /Presupuestos/ }).getByLabel(/vencen hoy/)).toBeVisible();
    await page.getByRole('button', { name: 'Ver los que vencen hoy' }).click();
    const rows = page.locator('tbody tr');
    await expect(rows.first().getByText('Vence hoy')).toBeVisible();
    expect(await rows.filter({ hasNot: page.getByText('Vence hoy') }).count()).toBe(0);
  });
});
