import { prisma } from "../../utils/prisma";

// export interface WorkCenter {
//   id: string;
//   name: string;
// }

export async function getWorkCenters() {
  return prisma.workCenter.findMany({
    // select: {
    //   id: true,
    //   name: true,
    // },
  });
}
