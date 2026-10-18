import { test, expect } from '@playwright/test';

const stamp = Date.now().toString().slice(-6);

test.describe('apoderado, convenio del paciente y sedes', () => {
  test.use({ extraHTTPHeaders: { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3100' } });

  test('el apoderado no puede ser el mismo paciente', async ({ page }) => {
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Nombres').fill(`Ana${stamp}`);
    await page.getByLabel('Apellidos').fill('Mismo Apoderado');
    await page.getByLabel('Fecha de nacimiento').fill('2015-01-20');
    await page.getByLabel('Nombre completo del apoderado').fill(`Ana${stamp} Mismo Apoderado`);
    await page.getByLabel('Parentesco').selectOption({ label: 'Madre' });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('El apoderado no puede ser el mismo paciente').first()).toBeVisible();
    await expect(page).toHaveURL(/\/app\/patients\/new$/);
  });

  test('convenio escrito que no existe se crea automáticamente y no se duplica', async ({ page, request }) => {
    const agName = `Club Náutico E2E ${stamp}`;
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Nombres').fill(`Conv${stamp}`);
    await page.getByLabel('Apellidos').fill('Paciente Convenio');
    await page.getByLabel('Tiene convenio (empresa o club)').check();
    await page.getByPlaceholder('Escribe el nombre del convenio o la empresa').fill(agName);
    await page.getByRole('option', { name: `+ Crear convenio «${agName}»` }).click();
    await expect(page.getByText('nuevo, se registrará al guardar')).toBeVisible();
    await page.getByLabel('N° de socio / carnet (opcional)').fill('A-123');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]{36}$/);
    await expect(page.getByText(`${agName} (0 %) · Socio N° A-123`)).toBeVisible();

    // Otro paciente: escribir el mismo nombre (sin tildes ni mayúsculas) sugiere el existente, no ofrece crear
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Tiene convenio (empresa o club)').check();
    await page.getByPlaceholder('Escribe el nombre del convenio o la empresa').fill(`club nautico e2e ${stamp}`);
    await expect(page.getByRole('option', { name: new RegExp(`Club Náutico E2E ${stamp}`) })).toBeVisible();
    await expect(page.getByRole('option', { name: /Crear convenio/ })).toHaveCount(0);

    // El SP también evita duplicados si llega el nombre escrito distinto (p. ej. desde la cola offline)
    const p2 = crypto.randomUUID();
    const res = await request.post('/api/sync/push', { data: { ops: [{ opId: crypto.randomUUID(), type: 'patient.save', payload: {
      id: p2, firstName: `Dup${stamp}`, lastName: 'Convenio', isActive: true, requiresGuardian: false, agreementName: `CLUB NAUTICO E2E ${stamp}` } }] } });
    expect((await res.json()).results[0].ok).toBe(true);
    const agreements = await (await request.get('/api/agreements?all=1')).json();
    expect(agreements.filter((x: { name: string }) => x.name.toLowerCase().includes(`e2e ${stamp}`))).toHaveLength(1);
  });

  test('sedes: la clínica sólo las consulta (las habilita el super admin)', async ({ page, request }) => {
    const { branches, usage } = await (await request.get('/api/branches?all=1')).json();
    expect(usage.max_branches).toBe(1);
    expect(branches.filter((x: { is_active: number }) => x.is_active)).toHaveLength(1);
    // La API de la clínica no permite crear sedes
    const res = await request.post('/api/branches', { data: { id: crypto.randomUUID(), code: `S${stamp}`, name: 'Sede 2', isMain: false, isActive: true } });
    expect(res.status()).toBe(405);

    await page.goto('/app/settings');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: 'Sedes' }).click();
    await expect(page.getByText('Sede principal')).toBeVisible();
    await expect(page.getByText('Las sedes las habilita OdontoSis')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva sede' })).toHaveCount(0);
  });

  test('el presupuesto impreso muestra la sede', async ({ page }) => {
    await page.goto('/app/budgets');
    await page.waitForLoadState('networkidle');
    await page.locator('tbody tr').first().click();
    await page.waitForURL(/\/app\/budgets\/[0-9a-f-]{36}$/);
    await expect(page.getByText(/^Sede:/)).toBeVisible();
  });
});
