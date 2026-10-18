import 'server-only';
import { unlink } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { callSp, spRows } from '../db';
import { env } from '../env';

/**
 * Recolección de binarios en el volumen compartido: borra del disco los archivos eliminados
 * (y las capturas de solicitudes nunca usadas) para que nadie pueda llenar el volumen con
 * subidas descartadas. Las reglas de qué se purga viven en sp_file_gc_candidates.
 */
let running: Promise<number> | null = null;
let lastRun = 0;

export function runFileGc(minIntervalMs = 60_000): Promise<number> {
  if (running) return running;
  if (Date.now() - lastRun < minIntervalMs) return Promise.resolve(0);
  lastRun = Date.now();
  running = (async () => {
    const root = resolve(env().UPLOAD_DIR);
    let purged = 0;
    for (let round = 0; round < 20; round++) {
      const rows = await spRows<{ id: string; storage_key: string }>('sp_file_gc_candidates', [200]);
      if (!rows.length) break;
      for (const r of rows) {
        const full = resolve(root, r.storage_key);
        if (full.startsWith(root + sep)) {
          await unlink(full).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
        }
        await callSp('sp_file_mark_purged', [r.id]);
        purged++;
      }
    }
    if (purged) console.info(`[file-gc] ${purged} archivo(s) purgado(s) del volumen`);
    return purged;
  })().catch((e) => { console.error('[file-gc] error', e instanceof Error ? e.message : e); return 0; })
    .finally(() => { running = null; });
  return running;
}
