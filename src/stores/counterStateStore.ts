import { prisma } from "@/lib/prisma";

export const CounterStateStore = {
  async get({ workcenterId }: { workcenterId: string }) {
    return prisma.counterState.findUnique({ where: { workcenterId } });
  },

  async set({
    workcenterId,
    value,
    timestamp,
  }: {
    workcenterId: string;
    value: number;
    timestamp: Date;
  }) {
    await prisma.counterState.upsert({
      where: { workcenterId },
      update: { value, timestamp },
      create: { workcenterId, value, timestamp },
    });
  },
};
