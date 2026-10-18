#!/usr/bin/env node
/**
 * Migrador de base de datos OdontoSis.
 *
 *  - database/migrations/V###__*.sql  -> versionadas, se aplican una sola vez (inmutables)
 *  - database/procedures/*.sql        -> repetibles (stored procedures), se re-aplican si cambia su checksum
 *
 * Se conecta con el usuario MIGRADOR (DB_MIGRATOR_USER). La app usa otro usuario con solo EXECUTE.
 * Los archivos soportan `DELIMITER $$` igual que el cliente mysql / Workbench.
 *
 * Uso: node scripts/db-migrate.mjs [--dry-run] [--reapply-procedures]
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'database');
const dryRun = process.argv.includes('--dry-run');
const reapply = process.argv.includes('--reapply-procedures');
const env = process.env;

for (const k of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_MIGRATOR_USER', 'DB_MIGRATOR_PASSWORD']) {
  if (!env[k]) throw new Error(`Falta la variable de entorno ${k}`);
}

/** Divide un archivo SQL en sentencias respetando DELIMITER. */
export function splitSql(text) {
  const statements = [];
  let delimiter = ';';
  let buf = [];
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    const d = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (d) { delimiter = d[1]; continue; }
    if (buf.length === 0 && (line.trim() === '' || line.trim().startsWith('--'))) continue;
    if (line.trim().startsWith('--')) continue;
    if (line.endsWith(delimiter)) {
      buf.push(line.slice(0, line.length - delimiter.length));
      const stmt = buf.join('\n').trim();
      if (stmt) statements.push(stmt);
      buf = [];
    } else {
      buf.push(rawLine);
    }
  }
  if (buf.join('').trim()) statements.push(buf.join('\n').trim());
  return statements;
}

const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
const list = (dir) => readdirSync(join(root, dir)).filter((f) => f.endsWith('.sql')).sort();

const conn = await mysql.createConnection({
  host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_MIGRATOR_USER,
  password: env.DB_MIGRATOR_PASSWORD, database: env.DB_NAME, multipleStatements: false,
  charset: 'UTF8MB4_0900_AI_CI',
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
});

// Fechas en UTC (el procedimiento existe a partir de la primera ejecución)
await conn.query('CALL sp_connection_init()').catch(() => {});

async function applied() {
  try {
    const [rows] = await conn.query('CALL sp_schema_migration_list()');
    return new Map(rows[0].map((r) => [r.version, r.checksum]));
  } catch (e) {
    if (e.code === 'ER_SP_DOES_NOT_EXIST') return new Map();
    throw e;
  }
}

async function run(file, dir, kind, done) {
  const text = readFileSync(join(root, dir, file), 'utf8');
  const sum = sha(text);
  const key = kind === 'REPEATABLE' ? `R:${file}` : file;
  const prev = done.get(key);
  if (prev === sum && !(reapply && kind === 'REPEATABLE')) return false;
  if (prev && kind === 'VERSIONED') {
    throw new Error(`La migración ${file} ya fue aplicada y su contenido cambió. Crea una nueva versión.`);
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}→ ${kind === 'VERSIONED' ? 'migración' : 'procedimientos'} ${file}`);
  if (dryRun) return true;
  for (const stmt of splitSql(text)) {
    try { await conn.query(stmt); }
    catch (e) { console.error(`✗ Error en ${file}:\n${stmt.slice(0, 400)}\n`); throw e; }
  }
  await conn.query('CALL sp_schema_migration_register(?, ?, ?, ?)', [key, sum, kind, env.DB_MIGRATOR_USER]);
  return true;
}

try {
  let count = 0;
  for (const f of list('migrations')) if (await run(f, 'migrations', 'VERSIONED', await applied())) count++;
  const done = await applied();
  for (const f of list('procedures')) if (await run(f, 'procedures', 'REPEATABLE', done)) count++;
  console.log(count ? `✓ ${count} archivo(s) aplicados en ${env.DB_NAME}` : `✓ ${env.DB_NAME} al día`);
} finally {
  await conn.end();
}
