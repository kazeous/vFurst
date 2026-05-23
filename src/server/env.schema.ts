import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url()
});

export type ServerEnv = z.infer<typeof envSchema>;
