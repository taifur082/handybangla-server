import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Email configuration (optional - email will be disabled if not provided)
  EMAIL_ENABLED: z.coerce.boolean().default(false),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().int().positive().optional(),
  EMAIL_SECURE: z.coerce.boolean().default(false),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_FROM_NAME: z.string().default("HandyBangla"),
  // Frontend URL for email links
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  GOOGLE_MAPS_API_KEY: z.string().optional(), // For geocoding and maps
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  EMAIL_ENABLED: process.env.EMAIL_ENABLED,
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_SECURE: process.env.EMAIL_SECURE,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  FRONTEND_URL: process.env.FRONTEND_URL,
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
});

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:", parsed.error.flatten());
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;

