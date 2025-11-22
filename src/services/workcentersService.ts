//src\services\workcentersService.ts
import { ENV } from "@/config/env";
import { prisma } from "../lib/prisma";
import { WorkCenter, WorkCenterStatus } from "@prisma/client";
import logger from "./logger";

let cachedWorkcenters: WorkCenter[] | null = null;
let lastFetchTime = 0;

export async function fetchWorkcenters(): Promise<WorkCenter[]> {
  const now = Date.now();
  if (
    cachedWorkcenters &&
    now - lastFetchTime < ENV.CACHE_TTL_SECONDS * 1_000
  ) {
    return cachedWorkcenters;
  }

  try {
    const workcenters = await prisma.workCenter.findMany({
      where: { deletedAt: null },
    });
    cachedWorkcenters = workcenters;
    lastFetchTime = now;
    return workcenters;
  } catch (err) {
    if (err instanceof Error) {
      logger.error({ err }, "Erro ao buscar centros de trabalho");
    } else {
      logger.error("Erro desconhecido ao buscar centros de trabalho");
    }
    return [];
  }
}

/**
 * Atualiza o status de um workcenter.
 */
export async function updateWorkcenterStatus({
  workcenterId,
  status,
}: {
  workcenterId: string;
  status: WorkCenterStatus;
}) {
  try {
    await prisma.workCenter.update({
      where: { id: workcenterId },
      data: { status },
    });
  } catch (err) {
    logger.error(
      { err },
      `❌ Erro ao atualizar status do workcenter ${workcenterId}`,
    );
  }
}
