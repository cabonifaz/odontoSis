import { test, expect } from '@playwright/test';

const stamp = Date.now().toString().slice(-6);

test.describe.serial('apoderado, convenios, agenda y permisos', () => {
  // Peticiones directas a la API con el mismo Origin que el navegador (la API exige Origin en métodos no-GET)
  test.use({ extraHTTPHeaders: { Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3100' } });
  const kid = `Niño${stamp}`;
  const agName = `Club E2E ${stamp}`;

  test('menor de edad: exige apoderado y se registra rápido', async ({ page }) => {
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await page.getByLabel('Nombres').fill(kid);
    await page.getByLabel('Apellidos').fill('Prueba Menor');
    await page.getByLabel('Fecha de nacimiento').fill('2018-05-10');
    await expect(page.getByText('Obligatorio: menor de edad')).toBeVisible();

    // Sin apoderado no se puede guardar
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Ingresa el nombre del apoderado').first()).toBeVisible();

    await page.getByLabel('Nombre completo del apoderado').fill('Rosa Prueba Menor');
    await page.getByLabel('Parentesco').selectOption({ label: 'Madre' });
    await page.getByLabel('Teléfono del apoderado').fill('988 777 666');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page).toHaveURL(/\/app\/patients\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Menor de edad')).toBeVisible();
    await expect(page.getByText('Apoderado: Rosa Prueba Menor')).toBeVisible();
  });

  test('botón rápido "Es menor de edad" sin fecha de nacimiento', async ({ page }) => {
    await page.goto('/app/patients/new');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Es menor de edad' }).click();
    await expect(page.getByLabel('Nombre completo del apoderado')).toBeFocused();
    await expect(page.getByLabel('Parentesco')).toHaveValue(/.+/); // precargado con "Madre"
  });

  test('convenio: se crea y descuenta en el presupuesto', async ({ page }) => {
    await page.goto('/app/agreements');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Nuevo convenio' }).click();
    await page.getByLabel('Nombre del convenio').fill(agName);
    await page.getByLabel('Código').fill(`E2E${stamp}`);
    await page.getByLabel('Descuento (%)').fill('20');
    await page.getByLabel('Empresa o club').fill('Club de Prueba');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Convenio guardado.')).toBeVisible();
    await expect(page.getByText(agName)).toBeVisible();

    await page.goto('/app/budgets/new');
    await page.waitForLoadState('networkidle');
    await page.getByPlaceholder('Buscar paciente por nombre o H.C.').fill(kid);
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByLabel('Convenio').selectOption({ label: `${agName} (20 %)` });
    await page.getByPlaceholder('Buscar en la lista de precios').fill('EXAMEN CON ODONTOGRAMA');
    await page.getByRole('listbox').getByRole('option').first().click();
    await page.getByRole('button', { name: 'General' }).click();
    await expect(page.getByText('Ahorro por convenio (20 %)')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
    await expect(page).toHaveURL(/\/app\/budgets\/[0-9a-f-]{36}$/);
    // 50 - 20 % = 40 (calculado en el SP)
    await expect(page.getByText('TOTAL A CANCELAR: S/ 40.00')).toBeVisible();
    await expect(page.getByText(new RegExp(`Convenio:.*${agName}`))).toBeVisible();
    await expect(page.getByText('Apoderado:').first()).toBeVisible();
    // El título (nombre del PDF al imprimir) no lleva el nombre de la app
    await expect(page).toHaveTitle(/^Presupuesto N° \d{6} - /);
    expect(await page.title()).not.toContain('OdontoSis');
  });

  test('agenda: citas simultáneas de 2 doctores se ven lado a lado', async ({ page }) => {
    // Fecha dentro de la ventana offline (+120 días) y hora única por corrida
    const date = new Date(Date.now() + (30 + (Number(stamp) % 80)) * 86_400_000).toISOString().slice(0, 10);
    const time = `${String(7 + (Number(stamp) % 12)).padStart(2, '0')}:${Number(stamp) % 2 ? '30' : '00'}`;
    await page.goto(`/app/agenda?date=${date}`);
    await page.waitForLoadState('networkidle');
    for (const doctor of ['Ana Torres', 'Luis Mendoza']) {
      await page.getByRole('button', { name: 'Nueva cita' }).first().click();
      await page.getByPlaceholder('Buscar paciente por nombre o H.C.').fill(kid);
      await page.getByRole('listbox').getByRole('option').first().click();
      await page.getByLabel('Doctor').last().selectOption({ label: doctor });
      await page.getByLabel('Fecha').fill(date);
      await page.getByLabel('Hora').fill(time);
      await page.getByRole('button', { name: 'Guardar' }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
    }
    const cards = page.locator(`button[title^="${kid}"]`);
    await expect(cards).toHaveCount(2);
    const [a, b] = [await cards.nth(0).boundingBox(), await cards.nth(1).boundingBox()];
    expect(a && b).toBeTruthy();
    // misma fila horaria, sin superponerse horizontalmente
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
    expect(a!.x + a!.width <= b!.x + 1 || b!.x + b!.width <= a!.x + 1).toBe(true);
  });

  test('permiso "editar presupuestos": sin él, el servidor rechaza modificar uno emitido', async ({ request }) => {
    // El usuario de pruebas (admin) se quita a sí mismo el permiso; los permisos se leen en cada request
    const me = process.env.E2E_ADMIN_EMAIL ?? 'e2e@demo.odontosis.pe';
    const { users } = await (await request.get('/api/users')).json();
    const u = users.find((x: { email: string }) => x.email === me);
    const setDeny = (deny: string[]) => request.put(`/api/users/${u.id}`, { data: { fullName: u.full_name, roleCode: u.role_code, isActive: true, permissionOverrides: { grant: [], deny } } });
    const denied = await setDeny(['budgets.edit']);
    expect(denied.ok(), await denied.text()).toBeTruthy();
    try {
      const list = await (await request.get('/api/budgets?limit=1')).json();
      const existing = await (await request.get(`/api/budgets/${list.rows[0].id}`)).json();
      const payload = {
        id: existing.id, patientId: existing.patient_id, doctorId: existing.doctor_id, budgetDate: existing.budget_date.slice(0, 10), statusCode: 'DRAFT',
        deductible: 0, coinsurancePct: 0, discount: 0, notes: 'intento de edición',
        items: existing.items.map((i: { id: string; service_id: string | null; description: string; unit_price: number }) => ({ id: i.id, serviceId: i.service_id, description: i.description, quantity: 1, unitPrice: Number(i.unit_price) })),
        marks: [],
      };
      const push = await (await request.post('/api/sync/push', { data: { ops: [{ opId: crypto.randomUUID(), type: 'budget.save', payload }] } })).json();
      expect(push.results[0].ok).toBe(false);
      expect(push.results[0].error.code).toBe('BUDGET_EDIT_FORBIDDEN');
      expect((await request.post(`/api/budgets/${existing.id}/status`, { data: { statusCode: 'SENT' } })).status()).toBe(403);
      expect((await request.delete(`/api/budgets/${existing.id}`)).status()).toBe(403);
    } finally {
      // Se restablece el permiso por defecto del rol
      expect((await setDeny([])).ok()).toBeTruthy();
    }
  });
});
