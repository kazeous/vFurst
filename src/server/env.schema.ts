import { z } from "zod";

const optionalSecret = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url(),
  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: optionalSecret
});

export type ServerEnv = z.infer<typeof envSchema>;
