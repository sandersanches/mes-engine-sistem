// src\stores\processVariableAlertLogStore.ts
import { prisma } from "@/lib/prisma";

export const ProcessVariableAletLogStore = {
  async create({
    processVariableId,
    startTime,
    endTime,
    peakValue,
    limitType,
  }: {
    processVariableId: string;
    startTime: Date;
    endTime: Date;
    peakValue: number;
    limitType: string;
  }) {
    return await prisma.processVariableAlertLog.create({
      data: {
        processVariableId,
        startTime,
        endTime,
        peakValue,
        limitType,
      },
    });
  },

  async update({
    id,
    endTime,
    peakValue,
  }: {
    id: string;
    endTime: Date;
    peakValue: number;
  }) {
    return await prisma.processVariableAlertLog.update({
      where: { id },
      data: {
        endTime,
        peakValue,
      },
    });
  },
};
