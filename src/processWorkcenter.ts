import { WorkCenter, Shift, Order } from "@prisma/client";
import { InfluxPoint } from "./services/metrics/influxService";
import { getActiveShift } from "./utils/getActiveShift";
import { LastProcessedStore } from "./utils/lastProcessedStore";
import { upsertProductionMetric } from "./services/productionMetricsService";

type processWorkcenterProps = {
  workcenter: WorkCenter;
  points: InfluxPoint[];
  shifts: Shift[];
  orders: Order[];
};
type ProcessWorkcenterResult = { success: boolean };

export async function processWorkcenter({
  workcenter,
  points,
  shifts,
  orders,
}: processWorkcenterProps): Promise<ProcessWorkcenterResult> {
  try {
    if (points.length === 0) {
      console.log(`⏸️ ${workcenter.name}: nenhum ponto novo.`);
      return { success: true };
    }

    for (const point of points) {
      const timestamp = new Date(point.time);

      // turno
      const shift = getActiveShift(timestamp, shifts);
      if (!shift) {
        console.warn(
          `⚠️ Nenhum turno encontrado para ${workcenter.name} @ ${point.time}`,
        );
        continue;
      }

      // ordem ativa ou em aberto: startDate <= timestamp && (no endDate || endDate >= timestamp)
      const order = orders.find((o) => {
        if (o.workCenterId !== workcenter.id) return false;
        if (!o.startDate) return false;
        const start = new Date(o.startDate);
        const end = o.endDate ? new Date(o.endDate) : null;
        return start <= timestamp && (!end || end >= timestamp);
      });

      const filterOrder = order ? order.id : "no_order";

      // hora agrupada (início da hora)
      const hour = new Date(timestamp);
      hour.setMinutes(0, 0, 0);
      // console.log("hour: ", hour);

      // chama o serviço de persistência (upsert)
      await upsertProductionMetric({
        hour,
        workCenterId: workcenter.id,
        shiftId: shift.id,
        filterOrder,
        orderId: order?.id ?? null,
        initialQuantity: point.value,
        finalQuantity: point.value,
        initialTime: timestamp,
        finalTime: timestamp,
      });
    }

    // atualiza lastProcessed com o último ponto do lote
    const lastTimestamp = points[points.length - 1].time;
    await LastProcessedStore.set(workcenter.name, lastTimestamp);

    return { success: true };
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.error(
        `❌ Erro ao Processar Workcenter: ${workcenter.name}: `,
        err.message,
      );
    } else {
      console.error(
        `❌ Erro desconhecido ao Processar Workcenter: ${workcenter.name}`,
      );
    }
    return { success: false };
  }
}
