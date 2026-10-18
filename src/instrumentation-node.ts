import { runFileGc } from './lib/server/services/file-gc';

// Recolección horaria de binarios huérfanos en el volumen (primera pasada al minuto de arrancar)
if (process.env.NEXT_PHASE !== 'phase-production-build') {
  const tick = () => { void runFileGc(); };
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 60 * 60_000).unref();
}
