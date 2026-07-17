import { z } from "zod";

export const requiredWorkerRuntimeVariables = [
  "DATABASE_URL",
  "VFURST_DB_CONNECTION_LIMIT",
  "VFURST_DB_POOL_TIMEOUT_SECONDS",
  "EMAIL_DELIVERY_ENCRYPTION_KEY",
  "REDIS_URL",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME"
] as const;

export class WorkerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerConfigurationError";
  }
}

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function requiredText(name: string) {
  return z.preprocess(emptyStringToUndefined, z.string({ error: `${name} is required.` }).trim().min(1, `${name} is required.`));
}

function requiredUrl(name: string, protocols: string[]) {
  return requiredText(name).refine(
    (value) => {
      try {
        const url = new URL(value);
        return protocols.includes(url.protocol);
      } catch {
        return false;
      }
    },
    {
      message: `${name} must be a valid ${protocols.join(" or ")} URL.`
    }
  );
}

function optionalUrl(name: string) {
  return z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .refine(
        (value) => {
          try {
            new URL(value);
            return true;
          } catch {
            return false;
          }
        },
        {
          message: `${name} must be a valid URL.`
        }
      )
      .optional()
  );
}

function optionalText() {
  return z.preprocess(emptyStringToUndefined, z.string().trim().min(1).optional());
}

function optionalPort(name: string) {
  return z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int(`${name} must be an integer.`).min(1).max(65_535).optional()
  );
}

function requiredPositiveInteger(name: string) {
  return z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int(`${name} must be an integer.`).min(1, `${name} must be positive.`)
  );
}

function optionalBoolean(name: string) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "") {
      return undefined;
    }

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }

    return value;
  }, z.boolean({ error: `${name} must be true or false.` }).optional());
}

const envSchema = z
  .object({
    AWS_ACCESS_KEY_ID: requiredText("AWS_ACCESS_KEY_ID"),
    AWS_REGION: requiredText("AWS_REGION"),
    AWS_SECRET_ACCESS_KEY: requiredText("AWS_SECRET_ACCESS_KEY"),
    CONTROL_PLANE_INVALIDATION_CHANNEL: optionalText().default("vfurst:control-plane:invalidations"),
    AWS_SESSION_TOKEN: optionalText(),
    DATABASE_URL: requiredUrl("DATABASE_URL", ["postgres:", "postgresql:"]),
    EMAIL_DELIVERY_ENCRYPTION_KEY: requiredText("EMAIL_DELIVERY_ENCRYPTION_KEY").refine(
      (value) => {
        try {
          const decoded = Buffer.from(value, "base64");
          return decoded.byteLength === 32 && decoded.toString("base64") === value;
        } catch {
          return false;
        }
      },
      { message: "EMAIL_DELIVERY_ENCRYPTION_KEY must be a base64-encoded 32-byte key." }
    ),
    VFURST_DB_CONNECTION_LIMIT: requiredPositiveInteger("VFURST_DB_CONNECTION_LIMIT"),
    VFURST_DB_POOL_TIMEOUT_SECONDS: requiredPositiveInteger("VFURST_DB_POOL_TIMEOUT_SECONDS"),
    REDIS_URL: requiredUrl("REDIS_URL", ["redis:", "rediss:"]),
    S3_BUCKET_NAME: requiredText("S3_BUCKET_NAME"),
    S3_ENDPOINT: optionalUrl("S3_ENDPOINT"),
    S3_PUBLIC_URL: optionalUrl("S3_PUBLIC_URL"),
    SMTP_FROM_EMAIL: optionalText(),
    SMTP_HOST: optionalText(),
    SMTP_PASSWORD: optionalText(),
    SMTP_PORT: optionalPort("SMTP_PORT"),
    SMTP_SECURE: optionalBoolean("SMTP_SECURE"),
    SMTP_USER: optionalText(),
    NEXT_PUBLIC_APP_URL: optionalUrl("NEXT_PUBLIC_APP_URL"),
    SEPAY_API_TOKEN: optionalText(),
    SEPAY_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    SEPAY_WEBHOOK_SECRET: optionalText(),
    WORKER_HEALTH_PORT: optionalPort("WORKER_HEALTH_PORT"),
    WORKER_STARTUP_TIMEOUT_MS: z.preprocess(
      emptyStringToUndefined,
      z.coerce.number().int().min(1_000).max(120_000).optional().default(30_000)
    )
  })
  .passthrough();

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => {
    const variable = issue.path[0] ? String(issue.path[0]) : "environment";
    return `${variable}: ${issue.message}`;
  });

  throw new WorkerConfigurationError(
    [
      "Worker startup configuration is invalid.",
      `Required environment variables: ${requiredWorkerRuntimeVariables.join(", ")}.`,
      `Invalid or missing values: ${issues.join("; ")}.`
    ].join(" ")
  );
}

export const workerEnv = parsedEnv.data;
