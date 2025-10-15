//src\services\shiftsService.ts
import { prisma } from "../lib/prisma";
import { Shift } from "@prisma/client";

let cachedShifts: Shift[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

export async function fetchShifts(): Promise<Shift[]> {
  const now = Date.now();
  if (cachedShifts && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedShifts;
  }

  try {
    const shifts = await prisma.shift.findMany();
    cachedShifts = shifts;
    lastFetchTime = now;
    return shifts;
  } catch (err) {
    if (err instanceof Error) {
      console.error("Erro ao buscar turnos:", err.message);
    } else {
      console.error("Erro desconhecido ao buscar turnos");
    }
    return [];
  }
}
