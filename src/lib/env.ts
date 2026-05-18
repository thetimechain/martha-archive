import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  LOG_LEVEL: z.string().default("info"),
  PORT: z.coerce.number().default(8080),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),
  ADMIN_TOKEN: z.string().min(1).optional(),
  RUN_MIGRATIONS: z
    .string()
    .default("0")
    .transform((v) => v === "1" || v.toLowerCase() === "true"),
  DATA_DIR: z.string().default("./data"),
  IMPORT_BATCH_SIZE: z.coerce.number().default(500),
  IMPORT_FAIL_THRESHOLD_PCT: z.coerce.number().default(5),
  SENTRY_DSN: z.string().optional(),
  CANONICAL_HOST: z.string().optional(),
  FLY_APP_NAME: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(): Env {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = result.data;
  return cached;
}

export const env = loadEnv();
