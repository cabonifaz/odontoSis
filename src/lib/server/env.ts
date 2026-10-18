import 'server-only';
import { z } from 'zod';

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'Debe ser una clave de 32 bytes en base64');

const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).default('true'),
  DB_POOL_SIZE: z.coerce.number().int().default(10),
  DATA_ENCRYPTION_KEY: base64Key,
  BLIND_INDEX_KEY: base64Key,
  SESSION_SECRET: z.string().min(32),
  UPLOAD_DIR: z.string().default('./.data/uploads'),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().default(15),
});

let cached: z.infer<typeof schema> | null = null;

/** Variables de entorno validadas (falla rápido si falta algo). */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Configuración inválida:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProd = () => env().APP_ENV !== 'development';
