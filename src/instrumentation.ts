/** Tareas de fondo del servidor. Sólo en runtime Node (el bundle edge no debe incluir mysql2). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node');
  }
}
