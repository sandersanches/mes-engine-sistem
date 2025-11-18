import { prisma } from "@/lib/prisma";

export const ProcessedStateStore = {
  async get({ workcenterId }: { workcenterId: string }): Promise<Date | null> {
    const record = await prisma.processedState.findUnique({
      where: { workcenterId },
    });
    return record?.lastProcessed ?? null;
  },

  async set({
    workcenterId,
    isoTime,
  }: {
    workcenterId: string;
    isoTime: string;
  }): Promise<void> {
    await prisma.processedState.upsert({
      where: { workcenterId },
      update: { lastProcessed: new Date(isoTime) },
      create: { workcenterId, lastProcessed: new Date(isoTime) },
    });
  },

  async getAll(): Promise<Record<string, string>> {
    const all = await prisma.processedState.findMany();
    return Object.fromEntries(
      all.map((r) => [r.workcenterId, r.lastProcessed?.toISOString() ?? ""]),
    );
  },

  async getMinTimestampIso(): Promise<string | null> {
    const record = await prisma.processedState.findFirst({
      orderBy: { lastProcessed: "asc" },
      where: { lastProcessed: { not: null } },
    });
    return record?.lastProcessed?.toISOString() ?? null;
  },

  async clear(): Promise<void> {
    await prisma.processedState.deleteMany();
  },
};
