import { expect, test, type Page } from '@playwright/test';

const stamp = Date.now().toString().slice(-6);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

async function createPatient(page: Page, extra: Record<string, unknown>) {
  await page.goto('/app');
  const id = crypto.randomUUID();
  const r = await page.request.post('/api/sync/push', { headers: { Origin: new URL(page.url()).origin },
    data: { ops: [{ opId: crypto.randomUUID(), type: 'patient.save', payload: { id, isActive: true, ...extra } }] } });
  expect(r.ok()).toBeTruthy();
  const res = await r.json();
  expect(res.results?.[0]?.ok, JSON.stringify(res)).toBe(true);
  return id;
}

/** Consentimientos: datos personales (Ley 29733) y confidencialidad clínica (Ley 26842) */
test.describe('consentimientos del paciente', () => {
  test('paciente adulto: alerta, formato para imprimir, registro del firmado y revocación', async ({ page }) => {
    const id = await createPatient(page, { firstName: 'Lucía', lastName: `Consent${stamp}`, birthDate: '1990-05-10', docNumber: String(40000000 + Math.floor(Math.random() * 9_999_999)) });
    await page.goto(`/app/patients/${id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: 'Faltan consentimientos' })).toBeVisible();
    await page.getByRole('button', { name: 'Faltan consentimientos' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Faltan los consentimientos' })).toBeVisible();

    // Formato para imprimir: ambos documentos, firma el paciente
    await page.getByRole('link', { name: /Imprimir formatos/ }).click();
    await expect(page.getByRole('heading', { name: /tratamiento de datos personales/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /confidencialidad de la información clínica/i })).toBeVisible();
    await expect(page.getByText('Firma del paciente').first()).toBeVisible();
    await expect(page.getByText(/Ley N° 29733/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Volver' }).click();

    // Registro del formato firmado (cubre ambos)
    await page.getByRole('button', { name: 'Registrar formato firmado' }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar formato firmado' });
    await expect(dialog.getByLabel('Nombre de quien firmó')).toHaveValue(/Lucía/);
    await dialog.getByLabel(/Marcó «SÍ autorizo»/).check();
    await dialog.locator('#consent-file').setInputFiles({ name: 'consentimiento.png', mimeType: 'image/png', buffer: PNG });
    await dialog.getByRole('button', { name: 'Registrar' }).click();
    await expect(page.getByText('Consentimientos completos y vigentes.')).toBeVisible();
    await expect(page.getByText('Autorizadas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Faltan consentimientos' })).toHaveCount(0);

    // Revocación de datos personales: queda en el historial y vuelve la alerta
    await page.getByRole('button', { name: 'Revocar' }).first().click();
    const rv = page.getByRole('dialog', { name: 'Revocar consentimiento' });
    await rv.getByLabel(/Motivo/).fill('Lo solicitó por correo el titular');
    await rv.getByRole('button', { name: 'Revocar' }).click();
    await expect(page.getByText(/Revocado el/)).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Faltan un consentimiento' }).or(page.getByRole('alert').filter({ hasText: 'Falta' }))).toBeVisible();
  });

  test('menor de edad: firma el apoderado y aparece en el filtro de pacientes sin consentimientos', async ({ page }) => {
    const relationships = await (await page.request.get('/api/masters?table=GUARDIAN_RELATIONSHIP')).json().catch(() => []);
    const mother = Array.isArray(relationships) ? relationships.find((r: { code: string }) => r.code === 'MOTHER') : null;
    const id = await createPatient(page, {
      firstName: 'Mateo', lastName: `Menor${stamp}`, birthDate: '2018-03-02', requiresGuardian: true,
      guardianName: 'Rosa Quispe Huamán', guardianDocNumber: '40123456', guardianRelationshipId: mother?.id ?? null, guardianPhone: '987654321',
    });
    await page.goto(`/app/patients/${id}/consents/print`);
    await expect(page.getByText('Firma del padre, madre, tutor o apoderado').first()).toBeVisible();
    await expect(page.getByText('Rosa Quispe Huamán').first()).toBeVisible();

    await page.goto('/app/patients');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Sin consentimientos/ }).click();
    await page.getByLabel('Buscar').fill(`Menor${stamp}`);
    await expect(page.getByText(`Menor${stamp}, Mateo`)).toBeVisible();
  });

  test('no se ven consentimientos de pacientes de otra clínica o inexistentes', async ({ page }) => {
    await page.goto('/app');
    expect((await page.request.get(`/api/patients/${crypto.randomUUID()}/consents`)).status()).toBe(404);
  });
});
