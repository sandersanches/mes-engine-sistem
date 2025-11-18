// src/services/ordersService.ts
import { prisma } from "../lib/prisma";
// import { LastProcessedStore } from "../utils/lastProcessedStore";
import { Order } from "@prisma/client";

/**
 * Busca ordens relevantes para o processamento de métricas.
 *
 * Critérios:
 *  - startDate <= agora → já iniciadas
 *  - deletedAt == null → não deletadas
 *  - (endDate >= windowStart OU endDate == null)
 *
 * Se não houver `minIso`, busca ordens dos últimos 30 dias.
 */
export async function fetchOrders({
  minIso,
}: {
  minIso: string | null;
}): Promise<Order[]> {
  try {
    // 🔹 Recupera o timestamp mínimo já processado (de todos os workcenters)
    // const minIso = await LastProcessedStore.getMinTimestampIso();
    const windowStart = minIso
      ? new Date(minIso)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // fallback: últimos 30 dias

    const now = new Date();

    console.log(
      `📋 Buscando ordens iniciadas até ${now.toISOString()}, com endDate >= ${windowStart.toISOString()} ou ainda abertas`,
    );

    const orders = await prisma.order.findMany({
      where: {
        deletedAt: null, // 🔹 apenas ordens válidas
        startDate: { lte: now }, // 🔹 já iniciadas
        OR: [
          { endDate: { gte: windowStart } }, // ainda relevantes
          { endDate: null }, // em andamento
        ],
      },
      orderBy: { startDate: "asc" },
    });

    return orders;
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error("❌ Erro ao buscar ordens:", err.message);
    } else {
      console.error("❌ Erro desconhecido ao buscar ordens");
    }
    return [];
  }
}

/**
 * Atualiza o finalQuantity da ordem ativa.
 */
export async function updateOrderFinalQuantity({
  orderId,
  finalQuantity,
}: {
  orderId: string;
  finalQuantity: number;
}) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { finalQuantity },
    });
  } catch (err) {
    console.error(
      `❌ Erro ao atualizar finalQuantity da ordem ${orderId}:`,
      err,
    );
  }
}

/**
 * Marca que a ordem iniciou a contagem (counterStarted = true)
 * e define initialQuantity e finalQuantity.
 */
export async function startOrderCounter({
  orderId,
  quantity,
}: {
  orderId: string;
  quantity: number;
}) {
  try {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        initialQuantity: BigInt(quantity),
        finalQuantity: BigInt(quantity),
        conterStarted: true,
      },
    });
  } catch (err) {
    console.error(`❌ Erro ao iniciar contagem da ordem ${orderId}:`, err);
  }
}
