//src\services\shiftsService.ts
import { ENV } from "@/config/env";
import { prisma } from "../lib/prisma";
import { Shift } from "@prisma/client";
import logger from "./logger";

let cachedShifts: Shift[] | null = null;
let lastFetchTime = 0;

export async function fetchShifts(): Promise<Shift[]> {
  const now = Date.now();
  if (cachedShifts && now - lastFetchTime < ENV.CACHE_TTL_SECONDS * 1_000) {
    return cachedShifts;
  }

  try {
    const shifts = await prisma.shift.findMany({ where: { deletedAt: null } });
    cachedShifts = shifts;
    lastFetchTime = now;
    return shifts;
  } catch (err) {
    if (err instanceof Error) {
      logger.error({ err }, "Erro ao buscar turnos:");
    } else {
      logger.error("Erro desconhecido ao buscar turnos");
    }
    return [];
  }
}
