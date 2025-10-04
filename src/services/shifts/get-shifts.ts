import { prisma } from "../../utils/prisma";

export async function getShifts() {
  return prisma.shift.findMany();
}
