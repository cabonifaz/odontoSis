import 'server-only';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { env } from './env';
import { AppError } from './errors';

/**
 * Único punto de acceso a MySQL.
 * Política del proyecto: la aplicación SOLO ejecuta stored procedures (CALL sp_*),
 * nunca sentencias SQL de datos. El usuario de BD de la app tiene únicamente permiso EXECUTE.
 */

declare global {
  var __odxPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__odxPool) {
    const e = env();
    const p = mysql.createPool({
      host: e.DB_HOST,
      port: e.DB_PORT,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      database: e.DB_NAME,
      connectionLimit: e.DB_POOL_SIZE,
      waitForConnections: true,
      timezone: 'Z',
      dateStrings: true,
      decimalNumbers: true,
      multipleStatements: false,
      charset: 'UTF8MB4_0900_AI_CI',
      ssl: e.DB_SSL === 'true' ? { rejectUnauthorized: e.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : undefined,
    });
    // Cada conexión nueva trabaja en UTC
    p.on('connection', (conn) => {
      conn.query('CALL sp_connection_init()');
    });
    globalThis.__odxPool = p;
  }
  return globalThis.__odxPool;
}

const SP_NAME = /^sp_[a-z0-9_]+$/;

export type Row = Record<string, unknown>;
type Param = string | number | boolean | null | undefined | Date;

/** Ejecuta un stored procedure y devuelve todos sus result sets. */
export async function callSp(name: string, params: Param[] = []): Promise<Row[][]> {
  if (!SP_NAME.test(name)) throw new Error(`Nombre de procedimiento inválido: ${name}`);
  const placeholders = params.map(() => '?').join(', ');
  const values = params.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
  try {
    const [result] = await pool().query(`CALL ${name}(${placeholders})`, values);
    // mysql2 devuelve [rs1, rs2, ..., ResultSetHeader]; nos quedamos con los result sets
    return Array.isArray(result)
      ? (result as unknown[]).filter((r): r is RowDataPacket[] => Array.isArray(r)).map((r) => r as Row[])
      : [];
  } catch (err) {
    throw AppError.fromDb(err);
  }
}

/** Primer result set. */
export async function spRows<T = Row>(name: string, params: Param[] = []): Promise<T[]> {
  const sets = await callSp(name, params);
  return (sets[0] ?? []) as T[];
}

/** Primera fila del primer result set (o null). */
export async function spOne<T = Row>(name: string, params: Param[] = []): Promise<T | null> {
  const rows = await spRows<T>(name, params);
  return rows[0] ?? null;
}
