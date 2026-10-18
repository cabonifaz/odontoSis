import { test, expect } from '@playwright/test';
import { tenantAccess } from '../../src/lib/shared/types';

const base = { subscriptionStart: null, subscriptionEnd: null, implementationStart: null, implementationEnd: null };

test.describe('regla de acceso de la clínica', () => {
  test('implementación: sólo dentro del periodo (ampliable)', () => {
    const t = { ...base, status: 'IMPLEMENTATION', implementationStart: '2026-10-01', implementationEnd: '2026-10-31' };
    expect(tenantAccess(t, '2026-10-15')).toMatchObject({ phase: 'IMPLEMENTATION', daysLeft: 16 });
    expect(tenantAccess(t, '2026-09-30')).toMatchObject({ phase: 'BLOCKED', reason: 'IMPLEMENTATION_NOT_STARTED' });
    expect(tenantAccess(t, '2026-11-01')).toMatchObject({ phase: 'BLOCKED', reason: 'IMPLEMENTATION_ENDED' });
    // ampliación: nueva fecha de fin => vuelve a tener acceso
    expect(tenantAccess({ ...t, implementationEnd: '2026-11-15' }, '2026-11-01')).toMatchObject({ phase: 'IMPLEMENTATION' });
  });

  test('producción: sin contrato vigente no puede trabajar', () => {
    expect(tenantAccess({ ...base, status: 'ACTIVE' }, '2026-10-15')).toMatchObject({ phase: 'BLOCKED', reason: 'NO_CONTRACT' });
    const t = { ...base, status: 'ACTIVE', subscriptionStart: '2026-11-01', subscriptionEnd: '2027-10-31' };
    expect(tenantAccess(t, '2026-10-15')).toMatchObject({ phase: 'BLOCKED', reason: 'CONTRACT_NOT_STARTED' });
    expect(tenantAccess(t, '2026-12-01')).toMatchObject({ phase: 'PRODUCTION' });
    expect(tenantAccess(t, '2027-11-01')).toMatchObject({ phase: 'BLOCKED', reason: 'CONTRACT_EXPIRED' });
  });

  test('suspendida o cancelada: sin acceso', () => {
    const t = { ...base, status: 'SUSPENDED', subscriptionStart: '2026-01-01', subscriptionEnd: '2027-01-01' };
    expect(tenantAccess(t, '2026-10-15').phase).toBe('BLOCKED');
    expect(tenantAccess({ ...t, status: 'CANCELLED' }, '2026-10-15').phase).toBe('BLOCKED');
  });
});

test.describe('clínica en implementación', () => {
  test.use({ extraHTTPHeaders: { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3100' } });

  test('muestra el aviso de implementación y marca de agua en el presupuesto', async ({ page }) => {
    await page.goto('/app');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Periodo de implementación').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Solicitar mejora/ })).toBeVisible();

    await page.goto('/app/budgets');
    await page.waitForLoadState('networkidle');
    await page.locator('tbody tr').first().click();
    await page.waitForURL(/\/app\/budgets\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Documento sin validez')).toBeVisible();
  });

  test('solicitud de mejora', async ({ page }) => {
    const title = `Mejora E2E ${Date.now().toString().slice(-6)}`;
    await page.goto('/app/requests?new=1');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Detalle').fill('Prueba automática: agregar un filtro por convenio en la lista de pacientes.');
    await page.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByText('Solicitud enviada.')).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByText('Abierta').first()).toBeVisible();
  });
});
