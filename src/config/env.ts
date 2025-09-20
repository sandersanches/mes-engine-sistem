// src/config/env.ts
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
});

// Valida process.env
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.format());
  // interrompe a aplicação para evitar rodar com config inválida
  throw new Error("Invalid environment variables. See logs above.");
}

// Exporta um objeto tipado e já convertido (PORT como number)
export const ENV = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parsed.data.PORT,
  DATABASE_URL: parsed.data.DATABASE_URL,
  JWT_SECRET: parsed.data.JWT_SECRET,
} as const;
