// src/services/downtimeService.ts
import { prisma } from "@/lib/prisma";
import { Downtime, ProductionMetrics, IntervalDowntime } from "@prisma/client";

export async function createDowntime(params: {
  workCenterId: string;
  orderId?: string | null;
  productionMetricsId: string;
  startTime: Date;
  endTime: Date;
}): Promise<Downtime> {
  return prisma.downtime.create({
    data: {
      workCenterId: params.workCenterId,
      orderId: params.orderId ?? null,
      productionMetricsId: params.productionMetricsId,
      startTime: params.startTime,
      endTime: params.endTime,
    },
  });
}

export async function updateDowntime(params: {
  downtimeId: string;
  endTime: Date;
}): Promise<Downtime> {
  return await prisma.downtime.update({
    where: { id: params.downtimeId },
    data: { endTime: params.endTime },
  });
}

export async function createIntervalDowntime(params: {
  downtimeId: string;
  metrics: ProductionMetrics;
  startTime: Date;
  endTime: Date;
}): Promise<IntervalDowntime> {
  return await prisma.intervalDowntime.create({
    data: {
      downtimeId: params.downtimeId,
      productionMetricsId: params.metrics.id,
      workCenterId: params.metrics.workCenterId,
      startTime: params.startTime,
      endTime: params.endTime,
    },
  });
}

export async function upsertIntervalDowntime(params: {
  downtimeId: string;
  metrics: ProductionMetrics;
  timestamp: Date;
}): Promise<IntervalDowntime> {
  return await prisma.intervalDowntime.upsert({
    where: {
      downtimeId_productionMetricsId: {
        downtimeId: params.downtimeId,
        productionMetricsId: params.metrics.id,
      },
    },
    create: {
      downtimeId: params.downtimeId,
      productionMetricsId: params.metrics.id,
      workCenterId: params.metrics.workCenterId,
      startTime: params.timestamp,
      endTime: params.timestamp,
    },
    update: {
      endTime: params.timestamp,
    },
  });
}

export async function updateIntervalDowntime(params: {
  id: string;
  endTime: Date;
}): Promise<IntervalDowntime> {
  return await prisma.intervalDowntime.update({
    where: { id: params.id },
    data: {
      endTime: params.endTime,
    },
  });
}
