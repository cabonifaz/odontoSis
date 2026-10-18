import { expect, test } from '@playwright/test';

// PNG 2x2 válido (rojo), como el que deja la herramienta Recortes en el portapapeles
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');

/** Solicitudes de soporte/mejora con capturas: pegar (Ctrl+V), elegir de galería y verlas al atender. */
test('adjunta capturas pegadas y elegidas a una solicitud', async ({ page }) => {
  const title = `Captura e2e ${Date.now().toString().slice(-6)}`;
  await page.goto('/app/requests?new=1');
  await page.waitForLoadState('networkidle');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByLabel('Detalle').fill('El botón de imprimir no aparece en el presupuesto.');

  // 1) Pegar desde el portapapeles (Win+Shift+S → Ctrl+V)
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, PNG.toString('base64'));

  // 2) Elegir de la galería (celular/tablet) o del explorador
  await dialog.locator('input[type=file]').setInputFiles({ name: 'pantallazo-cel.png', mimeType: 'image/png', buffer: PNG });

  await expect(dialog.getByRole('button', { name: /^Quitar/ })).toHaveCount(2);
  await expect(dialog.getByLabel('Subiendo')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByText('Solicitud enviada')).toBeVisible();

  const item = page.locator('li').filter({ hasText: title });
  const thumbs = item.getByRole('button', { name: /^Ver captura/ });
  await expect(thumbs).toHaveCount(2);
  await thumbs.first().click();
  const big = page.getByRole('dialog').locator('img');
  await expect(big).toBeVisible();
  expect(await big.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
});

test('rechaza adjuntar archivos ajenos o inexistentes', async ({ page }) => {
  await page.goto('/app');
  const r = await page.request.post('/api/requests', {
    headers: { Origin: new URL(page.url()).origin },
    data: { id: crypto.randomUUID(), typeCode: 'BUG', title: 'Adjunto inválido', description: 'Prueba de adjunto inválido', attachmentIds: [crypto.randomUUID()] },
  });
  expect(r.status()).toBe(400);
  expect((await r.json()).error.code).toBe('INVALID_ATTACHMENT');
});
