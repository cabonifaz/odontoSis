// Simulador del proveedor de DNI (formato Decolecta) para las pruebas: no consume el cupo real.
//   99999999 → 404 · resto → datos ficticios · exige "Authorization: Bearer test-token"
import { createServer } from 'node:http';

const port = Number(process.env.DNI_MOCK_PORT ?? 3199);
createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/health') return send(200, { ok: true });
  if (req.headers.authorization !== 'Bearer test-token') return send(401, { message: 'invalid token' });
  const n = url.searchParams.get('numero') ?? '';
  if (n === '99999999') return send(404, { message: 'not found' });
  send(200, { first_name: 'ANA LUCIA', first_last_name: 'PRUEBA', second_last_name: 'MOCK', full_name: 'PRUEBA MOCK, ANA LUCIA', document_number: n });
}).listen(port, () => console.log(`dni mock en :${port}`));
