// src/services/productionMetricsService.ts
import { ProductionMetrics } from "@prisma/client";
import { prisma } from "../lib/prisma";
import logger from "./logger";

type upsertProductionMetricsProps = {
  hour: Date;
  workCenterId: string;
  shiftId: string;
  filterOrder: string;
  initialQuantity: number;
  finalQuantity: number;
  initialTime: Date;
  finalTime: Date;
  orderId: string | null;
};

export async function upsertProductionMetric({
  hour,
  workCenterId,
  shiftId,
  filterOrder,
  finalQuantity,
  initialTime,
  finalTime,
  orderId,
  initialQuantity,
}: upsertProductionMetricsProps) {
  try {
    const productionMetric = await prisma.productionMetrics.upsert({
      where: {
        hour_workCenterId_shiftId_filterOrder: {
          hour,
          workCenterId,
          shiftId,
          filterOrder,
        },
      },
      update: {
        finalQuantity: BigInt(finalQuantity),
        finalTime: new Date(finalTime),
      },
      create: {
        hour,
        workCenterId,
        orderId,
        shiftId,
        initialQuantity: BigInt(initialQuantity),
        finalQuantity: BigInt(finalQuantity),
        initialTime: new Date(initialTime),
        finalTime: new Date(finalTime),
        filterOrder: filterOrder,
      },
    });
    return { success: true, productionMetric };
  } catch (err) {
    if (err instanceof Error) {
      logger.error({ err }, "Erro ao criar ou atualizar productionMetrics:");
    } else {
      logger.error("Erro desconhecido ao criar ou atualizar productionMetrics");
    }
    return { success: false };
  }
}

export async function updateProductionMetric(props: {
  id: string;
  finalQuantity: number;
  finalTime: Date;
}): Promise<ProductionMetrics> {
  return await prisma.productionMetrics.update({
    where: {
      id: props.id,
    },
    data: {
      finalQuantity: BigInt(props.finalQuantity),
      finalTime: new Date(props.finalTime),
    },
  });
}
