import { expect, test, request as pwRequest, type APIRequestContext } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

/**
 * Pruebas de ataque (hacking ético) sobre la API: cada caso reproduce un hallazgo de la auditoría
 * y verifica que ya no funciona. Usan IPs de documentación (RFC 5737) como "IP real" detrás del proxy
 * para no agotar los límites de las demás pruebas.
 */
const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const origin = new URL(base).origin;

// --- TOTP para el usuario de pruebas con 2FA ---
function b32(s: string) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const out: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totp(secret: string, step = Math.floor(Date.now() / 30_000)) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', b32(secret)).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  return ((h.readUInt32BE(off) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
const mfaUser = () => JSON.parse(execSync('node --conditions=react-server --import tsx scripts/e2e-mfa-user.mts', { stdio: 'pipe' })
  .toString().trim().split('\n').pop()!) as { email: string; password: string; secret: string };

/** Cliente "detrás del proxy": el atacante manda un X-Forwarded-For falso y el proxy agrega la IP real a la derecha. */
const ctx = (realIp: string): Promise<APIRequestContext> =>
  pwRequest.newContext({ baseURL: base, extraHTTPHeaders: { Origin: origin, 'X-Forwarded-For': `6.6.6.6, ${realIp}` } });

test.describe('auditoría de seguridad', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('falsificar X-Forwarded-For no evade el límite de intentos de login', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      // El atacante cambia la IP "izquierda" en cada intento; la que agrega el proxy (derecha) es la misma
      const api = await pwRequest.newContext({ baseURL: base, extraHTTPHeaders: { Origin: origin, 'X-Forwarded-For': `10.0.${i}.1, 198.51.100.7` } });
      const r = await api.post('/api/auth/login', { data: { email: `nadie${i}@ataque.test`, password: 'Incorrecta123!' } });
      statuses.push(r.status());
      await api.dispose();
    }
    expect(statuses).toContain(429);
  });

  test('una cuenta bloqueada responde igual que una inexistente (sin enumeración)', async () => {
    const u = mfaUser();
    const api = await ctx('198.51.100.21');
    for (let i = 0; i < 5; i++) await api.post('/api/auth/login', { data: { email: u.email, password: 'Incorrecta123!' } });
    const locked = await api.post('/api/auth/login', { data: { email: u.email, password: u.password } });
    const unknown = await api.post('/api/auth/login', { data: { email: 'noexiste-xyz@ataque.test', password: 'Incorrecta123!' } });
    expect(locked.status()).toBe(401);
    expect(unknown.status()).toBe(401);
    expect((await locked.json()).error.code).toBe((await unknown.json()).error.code);
    mfaUser(); // desbloquea para las demás pruebas
    await api.dispose();
  });

  test('2FA: el mismo código no sirve dos veces y 5 fallos cierran la sesión', async () => {
    const u = mfaUser();
    // 1) Login + código válido
    let api = await ctx('198.51.100.31');
    expect((await api.post('/api/auth/login', { data: { email: u.email, password: u.password } })).ok()).toBeTruthy();
    const code = totp(u.secret);
    expect((await api.post('/api/auth/mfa', { data: { code } })).ok()).toBeTruthy();
    await api.dispose();

    // 2) Repetir el mismo código en otra sesión: rechazado
    api = await ctx('198.51.100.32');
    await api.post('/api/auth/login', { data: { email: u.email, password: u.password } });
    expect((await api.post('/api/auth/mfa', { data: { code } })).status()).toBe(401);

    // 3) Fuerza bruta: al 5.º fallo (contando el de arriba) la sesión se revoca y la cuenta se bloquea
    const results: number[] = [];
    for (let i = 0; i < 4; i++) results.push((await api.post('/api/auth/mfa', { data: { code: '000000' } })).status());
    expect(results.at(-1)).toBe(401);
    expect((await api.get('/api/patients')).status()).toBe(401);
    // Ni con la contraseña correcta puede reintentar de inmediato (bloqueo, mismo mensaje genérico)
    const relogin = await api.post('/api/auth/login', { data: { email: u.email, password: u.password } });
    expect(relogin.status()).toBe(401);
    await api.dispose();
    mfaUser();
  });

  test('Origin "null" y cuerpos gigantes se rechazan sin error interno', async () => {
    const api = await pwRequest.newContext({ baseURL: base });
    const nullOrigin = await api.post('/api/auth/login', { headers: { Origin: 'null' }, data: { email: 'a@b.c', password: 'x' } });
    expect(nullOrigin.status()).toBe(403);
    const big = await api.post('/api/auth/login', {
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '6.6.6.6, 198.51.100.41' },
      data: JSON.stringify({ email: 'a@b.c', password: 'x', pad: 'x'.repeat(3 * 1024 * 1024) }),
    });
    expect(big.status()).toBe(413);
    await api.dispose();
  });
});

test.describe('auditoría de seguridad (con sesión)', () => {
  test('imágenes con dimensiones absurdas (bomba de descompresión) se rechazan', async ({ page }) => {
    await page.goto('/app');
    // PNG que declara 100000 x 100000 px en su cabecera
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write('IHDR', 12, 'ascii');
    png.writeUInt32BE(100_000, 16);
    png.writeUInt32BE(100_000, 20);
    const r = await page.request.post('/api/files', {
      headers: { Origin: origin },
      multipart: { kind: 'REQUEST_ATTACHMENT', file: { name: 'bomba.png', mimeType: 'image/png', buffer: png } },
    });
    expect(r.status()).toBe(400);
    expect((await r.json()).error.code).toBe('INVALID_FILE');
  });

  test('no se puede subir archivos a un paciente inexistente', async ({ page }) => {
    await page.goto('/app');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
    const r = await page.request.post(`/api/patients/${crypto.randomUUID()}/files/upload`, {
      headers: { Origin: origin },
      multipart: { file: { name: 'x.png', mimeType: 'image/png', buffer: png } },
    });
    expect(r.status()).toBe(404);
  });

  test('la consulta de DNI no se dispara con un enlace y la paginación inválida no rompe', async ({ page }) => {
    await page.goto('/app');
    const viaGet = await page.request.get('/api/identity/dni?numero=12345678');
    expect(await viaGet.json()).not.toHaveProperty('firstName'); // GET sólo informa si está habilitada
    for (const q of ['limit=-1', 'limit=0.5&offset=-3', 'limit=abc']) {
      expect((await page.request.get(`/api/patients?${q}`)).status(), q).toBe(200);
    }
  });

  test('IDs de otra clínica o inventados devuelven 404', async ({ page }) => {
    await page.goto('/app');
    const id = crypto.randomUUID();
    for (const p of [`/api/patients/${id}`, `/api/files/${id}`, `/api/budgets/${id}`]) {
      expect((await page.request.get(p)).status(), p).toBe(404);
    }
  });
});
