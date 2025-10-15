// src/processWorkcenter.ts
import { WorkCenter, Shift, Order } from "@prisma/client";
import { InfluxPoint } from "./services/metrics/influxService";
import { getActiveShift } from "./utils/getActiveShift";
import { LastProcessedStore } from "./utils/lastProcessedStore";
import { LastCounterStore } from "./utils/lastCounterStore";
import {
  updateProductionMetric,
  upsertProductionMetric,
} from "./services/productionMetricsService";
import {
  upsertIntervalDowntime,
  updateIntervalDowntime,
  updateDowntime,
  createDowntime,
  createIntervalDowntime,
} from "./services/downtimeService";
import { ENV } from "./config/env";
import { LastDowntimeStore } from "./utils/lastDowntimeStore";
import { LastMetricStore } from "./utils/lastMetricStore";

type ProcessWorkcenterProps = {
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
}: ProcessWorkcenterProps): Promise<ProcessWorkcenterResult> {
  try {
    if (points.length === 0) {
      console.log(`⏸️ ${workcenter.name}: nenhum ponto novo.`);
      return { success: true };
    }

    // 🔹 Recupera o último timestamp processado para garantir ordenação temporal
    const lastProcessed = await LastProcessedStore.get(workcenter.name);
    let lastProcessedDate = lastProcessed ? new Date(lastProcessed) : null;

    for (const point of points) {
      const timestamp = new Date(point.time);

      // 🔹 Evita reprocessamento ou pontos fora de ordem
      if (lastProcessedDate) {
        const tsValue = timestamp.getTime();
        const lastValue = lastProcessedDate.getTime();

        if (tsValue === lastValue) {
          // console.warn(
          //   `⚠️ Ignorando ponto: timestamp igual a lastProcessedDate ${timestamp.toISOString()}`,
          // );
          continue;
        } else if (tsValue < lastValue) {
          // console.warn(
          //   `⚠️ Ignorando ponto: timestamp menor que lastProcessedDate ${timestamp.toISOString()} < ${lastProcessedDate.toISOString()}`,
          // );
          continue;
        }
      }

      // 🔹 Turno ativo
      const shift = getActiveShift(timestamp, shifts);
      if (!shift) {
        console.warn(
          `❌ ${workcenter.name} Nenhum turno encontrado para ${point.time}`,
        );
        continue;
      }
      // console.log(`Turno de ${timestamp}: ${shift.name}`);

      // 🔹 Ordem ativa ou em aberto
      const order = orders.find((o) => {
        if (o.workCenterId !== workcenter.id) return false;
        if (!o.startDate) return false;
        const start = new Date(o.startDate);
        const end = o.endDate ? new Date(o.endDate) : null;
        return start <= timestamp && (!end || end >= timestamp);
      });

      const filterOrder = order ? order.id : "no_order";
      // console.log(`filterOrder: ${filterOrder} `);

      // 🔹 Determina a hora agrupada (início da hora)
      const hour = new Date(timestamp);
      hour.setMinutes(0, 0, 0);

      const lastMetric = await LastMetricStore.get(workcenter.name);
      // console.log(`LastMetric de ${workcenter.name} : ${lastMetric?.id} `);

      // 🔹 Cria ou atualiza métrica de produção
      const metric = await upsertProductionMetric({
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
      if (!metric.productionMetric || !metric.success) {
        console.log("erro ao criar ou atualizar métricas");
        continue;
      }

      try {
        // 🔹 Atualiza metrica anterior, se a o id da metrica atual for diferente do id da métrica anterior
        if (lastMetric && lastMetric.id !== metric.productionMetric.id) {
          await updateProductionMetric({
            id: lastMetric.id,
            finalQuantity: point.value,
            finalTime: timestamp,
          });
          console.log(
            `✅ ${workcenter.name}: Métrica anterior atualizada e nova métrica registrada`,
          );
        } else {
          console.log(
            `✅ ${workcenter.name}: Métrica atualizada - Quantidade Final: ${metric.productionMetric.finalQuantity}`,
          );
        }

        await LastMetricStore.set(workcenter.name, {
          id: metric.productionMetric.id,
        });
      } catch (error) {
        console.error(
          `❌ ${workcenter.name}: Erro ao atualizar última métrica`,
          error instanceof Error ? error.message : error,
        );
      }

      // 🔹 Recupera o último valor registrado do contador
      const lastCounter = await LastCounterStore.get(workcenter.name);
      // console.log(
      //   `lastCounter de ${workcenter.name} : ( timestamp:${lastCounter?.timestamp} value: ${lastCounter?.value}`,
      // );

      const lastDowntime = await LastDowntimeStore.get(workcenter.name);
      // console.log(
      //   `lastDowntime de ${workcenter.name} : ${lastDowntime?.downtimeId}`,
      // );

      if (!lastCounter) {
        // Primeira vez: grava o contador atual
        await LastCounterStore.set(workcenter.name, {
          value: point.value,
          timestamp: timestamp.toISOString(),
        });
        continue;
      }

      const diffSeconds =
        (timestamp.getTime() - new Date(lastCounter.timestamp).getTime()) /
        1000;

      // 🔹 Caso contador aumente → atualiza lastCounter e encerra downtime (se houver)
      if (point.value > lastCounter.value) {
        await LastCounterStore.set(workcenter.name, {
          value: point.value,
          timestamp: timestamp.toISOString(),
        });

        if (lastDowntime) {
          await LastDowntimeStore.delete(workcenter.name);
        }
        continue;
      }

      // 🔹 Caso contador esteja parado
      if (
        point.value === lastCounter.value &&
        diffSeconds >= ENV.DOWNTIME_THRESHOLD_SECONDS
      ) {
        // Já há uma parada aberta?
        if (!lastDowntime) {
          // ➕ Cria nova parada
          const downtime = await createDowntime({
            workCenterId: workcenter.id,
            orderId: order?.id ?? null,
            productionMetricsId: metric.productionMetric.id,
            startTime: new Date(lastCounter.timestamp),
            endTime: timestamp,
          });
          console.log(
            `⚠️  ${workcenter.name}: Nova Parada Criada - Inicio: ${downtime.startTime} - Fim: ${downtime.endTime}`,
          );

          const interval = await createIntervalDowntime({
            downtimeId: downtime.id,
            metrics: metric.productionMetric,
            startTime: new Date(lastCounter.timestamp),
            endTime: timestamp,
          });
          console.log(
            `⚠️  ${workcenter.name}: Nova Intervalo de parada Criado - Inicio: ${interval.startTime} - Fim: ${interval.endTime}`,
          );

          await LastDowntimeStore.set(workcenter.name, {
            downtimeId: downtime.id,
            intervalId: interval.id,
            productionMetricsId: metric.productionMetric.id,
            startTime: lastCounter.timestamp,
          });
        } else {
          // 🔄 Parada já aberta → atualizar parada
          const updatedDowntime = await updateDowntime({
            downtimeId: lastDowntime.downtimeId,
            endTime: timestamp,
          });
          console.log(
            `⚠️  ${workcenter.name}: Parada atualizada:  Inicio: ${updatedDowntime.startTime} - Fim: ${updatedDowntime.endTime} `,
          );

          const intervalUpserted = await upsertIntervalDowntime({
            downtimeId: lastDowntime.downtimeId,
            metrics: metric.productionMetric,
            timestamp: timestamp,
          });
          console.log(
            `⚠️  ${workcenter.name}: Intervalo de parada de atualizado - Inicio: ${intervalUpserted.startTime} - Fim: ${intervalUpserted.endTime}`,
          );

          // Caso a interval.id mude, atualiza ultimo intervalo e arquivo
          if (intervalUpserted.id !== lastDowntime.intervalId) {
            // Atualiza EndTime do intervalo com id Anterior
            const intervalUpdated = await updateIntervalDowntime({
              id: lastDowntime.intervalId,
              endTime: timestamp,
            });
            console.log(
              `⚠️  ${workcenter.name}: Intervalo de parada Antigo atualizado: - Inicio: ${intervalUpdated.startTime} - Fim: ${intervalUpdated.endTime}`,
            );

            await LastDowntimeStore.set(workcenter.name, {
              ...lastDowntime,
              intervalId: intervalUpserted.id,
              productionMetricsId: metric.productionMetric.id,
            });
          }
        }
      }
      lastProcessedDate = timestamp;
    }

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
