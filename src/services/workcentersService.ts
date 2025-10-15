//src\services\workcentersService.ts
import { prisma } from "../lib/prisma";
import { WorkCenter } from "@prisma/client";

let cachedWorkcenters: WorkCenter[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

export async function fetchWorkcenters(): Promise<WorkCenter[]> {
  const now = Date.now();
  if (cachedWorkcenters && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedWorkcenters;
  }

  try {
    const workcenters = await prisma.workCenter.findMany();
    cachedWorkcenters = workcenters;
    lastFetchTime = now;
    return workcenters;
  } catch (err) {
    if (err instanceof Error) {
      console.error("Erro ao buscar centros de trabalho:", err.message);
    } else {
      console.error("Erro desconhecido ao buscar centros de trabalho");
    }
    return [];
  }
}
