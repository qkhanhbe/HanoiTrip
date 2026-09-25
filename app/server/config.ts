import { z } from 'zod';
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  BUILD_SHA: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .default('local-dev'),
  ROUTES_MODE: z.enum(['demo', 'google']).default('demo'),
  DB_MODE: z.enum(['memory', 'mysql']).default('memory'),
  DIAGNOSTICS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MYSQL_HOST: z.string().default('127.0.0.1'),
  MYSQL_SOCKET_PATH: z.string().optional(),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z
    .string()
    .regex(/^[a-zA-Z0-9_]+$/)
    .default('hanoitrip'),
  MYSQL_USER: z.string().default('hanoitrip'),
  MYSQL_PASSWORD: z.string().default(''),
  MYSQL_TLS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MYSQL_CA_FILE: z.string().optional(),
  GOOGLE_ROUTES_API_KEY: z.string().default(''),
  GOOGLE_MAPS_BROWSER_KEY: z.string().default(''),
});
export type Config = z.infer<typeof envSchema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration fields: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  const config = parsed.data;
  if (
    config.ROUTES_MODE === 'google' &&
    (!config.GOOGLE_ROUTES_API_KEY || !config.GOOGLE_MAPS_BROWSER_KEY)
  )
    throw new Error('Google mode requires separate Routes and browser Maps keys');
  if (config.DB_MODE === 'mysql' && !config.MYSQL_PASSWORD)
    throw new Error('MySQL password is required');
  if (config.NODE_ENV === 'production' && (config.DB_MODE !== 'mysql' || !config.MYSQL_TLS))
    throw new Error('Production requires MySQL with verified TLS');
  if (config.NODE_ENV === 'production' && config.BUILD_SHA === 'local-dev')
    throw new Error('Production requires immutable BUILD_SHA');
  return config;
}
