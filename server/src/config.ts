import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MYSQL_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('decouverte-api'),
  APP_ORIGINS: z.string().default('http://localhost:8081'),
  REDIS_URL: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  LIVEKIT_URL: z.string().url().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(), S3_BUCKET: z.string().optional(), S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(), S3_SECRET_ACCESS_KEY: z.string().optional(),
  PUBLIC_API_URL: z.string().url().default('https://decouverte-api-production.up.railway.app'),
})

export const config = schema.parse(process.env)
export const allowedOrigins = new Set(config.APP_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean))
