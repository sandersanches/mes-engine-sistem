//src\config\env.ts
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config(); // carrega .env para process.env

// Schema de validação com zod
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // PORT: tenta converter para number; se undefined usa 3000
  PORT: z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "") {
      const n = Number(val);
      return Number.isNaN(n) ? undefined : n;
    }
    if (typeof val === "number") return val;
    return undefined;
  }, z.number().int().positive().default(3000)),

  DATABASE_URL: z.string().min(1, { message: "DATABASE_URL is required" }),
  JWT_SECRET: z.string().min(1, { message: "JWT_SECRET is required" }),

  // 🔹 InfluxDB
  INFLUX_URL: z.string().url({ message: "INFLUX_URL must be a valid URL" }),
  INFLUX_TOKEN: z.string().min(1, { message: "INFLUX_TOKEN is required" }),
  INFLUX_ORG: z.string().min(1, { message: "INFLUX_ORG is required" }),
  INFLUX_BUCKET: z.string().min(1, { message: "INFLUX_BUCKET is required" }),
  INFLUX_MEASUREMENT: z
    .string()
    .min(1, { message: "INFLUX_MEASUREMENT is required" }),

  // 🔹 Intervalo do motor de métricas
  METRICS_INTERVAL_SECONDS: z.preprocess((val) => {
    if (typeof val === "string" && val.trim() !== "") {
      const n = Number(val);
      return Number.isNaN(n) ? undefined : n;
    }
    if (typeof val === "number") return val;
    return undefined;
  }, z.number().int().positive().default(5)),
  DOWNTIME_THRESHOLD_SECONDS: z.coerce
    .number()
    .min(10, "Tempo mínimo inválido")
    .default(30),
});

// Valida process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  throw new Error("Invalid environment variables. See logs above.");
}

// Exporta um objeto tipado e já convertido
export const ENV = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parsed.data.PORT,
  DATABASE_URL: parsed.data.DATABASE_URL,
  JWT_SECRET: parsed.data.JWT_SECRET,

  INFLUX_URL: parsed.data.INFLUX_URL,
  INFLUX_TOKEN: parsed.data.INFLUX_TOKEN,
  INFLUX_ORG: parsed.data.INFLUX_ORG,
  INFLUX_BUCKET: parsed.data.INFLUX_BUCKET,
  INFLUX_MEASUREMENT: parsed.data.INFLUX_MEASUREMENT,

  METRICS_INTERVAL_SECONDS: parsed.data.METRICS_INTERVAL_SECONDS,
  DOWNTIME_THRESHOLD_SECONDS: parsed.data.DOWNTIME_THRESHOLD_SECONDS,
} as const;
