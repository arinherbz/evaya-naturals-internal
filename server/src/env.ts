import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.string().trim().optional(),
  CLIENT_URL: z.string().url().optional(),
  VITE_API_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(16).optional(),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(
    `Invalid environment configuration: ${parsedEnv.error.issues
      .map((issue) => `${issue.path.join('.')} ${issue.message}`)
      .join(', ')}`
  );
}

const env = parsedEnv.data;
const isProduction = env.NODE_ENV === 'production';

if (isProduction) {
  const missingKeys = ['DATABASE_URL', 'CLIENT_URL', 'VITE_API_URL', 'SESSION_SECRET'].filter((key) => {
    const value = env[key as keyof typeof env];
    return typeof value !== 'string' || value.trim().length === 0;
  });

  if (missingKeys.length > 0) {
    throw new Error(`Missing required production environment variables: ${missingKeys.join(', ')}`);
  }
}

export const appEnv = {
  nodeEnv: env.NODE_ENV,
  isProduction,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL?.trim(),
  clientUrl: env.CLIENT_URL?.trim() || 'http://localhost:3000',
  viteApiUrl: env.VITE_API_URL?.trim(),
  sessionSecret: env.SESSION_SECRET?.trim(),
  adminBootstrapPassword: env.ADMIN_BOOTSTRAP_PASSWORD?.trim(),
};

export function logServerError(scope: string, error: unknown) {
  if (appEnv.isProduction) {
    console.error(`${scope} failed`);
    return;
  }

  console.error(`${scope} failed:`, error);
}
