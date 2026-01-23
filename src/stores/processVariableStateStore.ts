// src\stores\processVariableStateStore.ts
import { prisma } from "@/lib/prisma";

export const ProcessVariableStateStore = {
  async create({
    processVariableId,
    alertLogId,
  }: {
    processVariableId: string;
    alertLogId: string;
  }) {
    return await prisma.processVariableState.create({
      data: {
        processVariableId,
        alertLogId,
      },
    });
  },

  async update({ id, alertLogId }: { id: string; alertLogId: string }) {
    return await prisma.processVariableState.update({
      where: {
        id,
      },
      data: {
        alertLogId,
      },
    });
  },

  async delete({ id }: { id: string }) {
    return await prisma.processVariableState.delete({
      where: {
        id,
      },
    });
  },
};
