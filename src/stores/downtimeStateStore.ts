import { prisma } from "@/lib/prisma";

export const DowntimeStateStore = {
  async get({ workcenterId }: { workcenterId: string }) {
    return prisma.downtimeState.findUnique({ where: { workcenterId } });
  },

  async set({
    workcenterId,
    data,
  }: {
    workcenterId: string;
    data: {
      downtimeId: string;
      intervalId: string;
      orderId: string | null;
      productionMetricsId: string;
      startTime: Date;
    };
  }) {
    await prisma.downtimeState.upsert({
      where: { workcenterId },
      update: data,
      create: { workcenterId, ...data },
    });
  },

  async delete({ workcenterId }: { workcenterId: string }) {
    await prisma.downtimeState.deleteMany({ where: { workcenterId } });
    return null;
  },
};
