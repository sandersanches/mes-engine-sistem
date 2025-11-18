import { prisma } from "@/lib/prisma";

export const MetricStateStore = {
  async get({
    workcenterId,
  }: {
    workcenterId: string;
  }): Promise<string | null> {
    const record = await prisma.metricState.findUnique({
      where: { workcenterId },
    });
    return record?.lastMetricId ?? null;
  },

  async set({
    workcenterId,
    metricId,
  }: {
    workcenterId: string;
    metricId: string;
  }): Promise<void> {
    await prisma.metricState.upsert({
      where: { workcenterId },
      update: { lastMetricId: metricId },
      create: { workcenterId, lastMetricId: metricId },
    });
  },

  async delete({ workcenterId }: { workcenterId: string }): Promise<void> {
    await prisma.metricState.deleteMany({ where: { workcenterId } });
  },
};
