// src\stores\processVariableStore.ts
import { prisma } from "@/lib/prisma";

export const ProcessVariableStore = {
  async getAll() {
    return await prisma.processVariable.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        unit: true,
        measurement: true,
        field: true,
        deviceId: true,
        lastvalue: true,
        isMinLimitMonitoring: true,
        isMaxLimitMonitoring: true,
        minValueLimit: true,
        maxValueLimit: true,
        ProcessVariableState: {
          select: {
            id: true,
            ProcessVariableAlertLog: true,
          },
        },
      },
    });
  },

  async update({
    id,
    lastvalue,
    updatedAt,
  }: {
    id: string;
    lastvalue: number;
    updatedAt: Date;
  }) {
    return await prisma.processVariable.update({
      where: { id },
      data: {
        lastvalue,
        updatedAt,
      },
    });
  },
};
