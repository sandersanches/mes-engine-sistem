// src/processWorkcenter.ts
import { WorkCenter, Shift, Order, WorkCenterStatus } from "@prisma/client";
import { InfluxPoint } from "./services/metrics/influxService";
import { getActiveShift } from "./utils/getActiveShift";
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
// import { LastProcessedStore } from "./utils/lastProcessedStore";
// import { LastMetricStore } from "./utils/lastMetricStore";
// import { LastCounterStore } from "./utils/lastCounterStore";
// import { LastDowntimeStore } from "./utils/lastDowntimeStore";
import { ProcessedStateStore } from "./stores/processedStateStore";
import { MetricStateStore } from "./stores/metricStateStore";
import { CounterStateStore } from "./stores/counterStateStore";
import { DowntimeStateStore } from "./stores/downtimeStateStore";
import {
  startOrderCounter,
  updateOrderFinalQuantity,
} from "./services/ordersService";
import { updateWorkcenterStatus } from "./services/workcentersService";
import logger from "./services/logger";

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
      logger.debug(` ${workcenter.name}: nenhum ponto novo.`);
      return { success: true };
    }

    // 🔹 Recupera o último timestamp processado para garantir ordenação temporal
    // const lastProcessed = await LastProcessedStore.get(workcenter.name);
    const lastProcessed = await ProcessedStateStore.get({
      workcenterId: workcenter.id,
    });
    let lastProcessedDate = lastProcessed ? new Date(lastProcessed) : null;

    for (const point of points) {
      const timestamp = new Date(point.time);

      // 🔹 Evita reprocessamento ou pontos fora de ordem
      if (lastProcessedDate) {
        const tsValue = timestamp.getTime();
        const lastValue = lastProcessedDate.getTime();

        if (tsValue === lastValue) {
          continue;
        } else if (tsValue < lastValue) {
          logger.warn(
            `Ignorando ponto: timestamp menor que lastProcessedDate ${timestamp.toISOString()} < ${lastProcessedDate.toISOString()}`,
          );
          continue;
        }
      }

      // 🔹 Turno ativo
      const shift = getActiveShift(timestamp, shifts);
      if (!shift) {
        logger.warn(
          ` ${workcenter.name} Nenhum turno encontrado para ${point.time}`,
        );
        continue;
      }

      // 🔹 Ordem ativa ou em aberto
      const order = orders.find((o) => {
        if (o.workCenterId !== workcenter.id) return false;
        if (!o.startDate) return false;
        const start = new Date(o.startDate);
        const end = o.endDate ? new Date(o.endDate) : null;
        return start <= timestamp && (!end || end >= timestamp);
      });

      const filterOrder = order ? order.id : "no_order";

      // 🔹  Atualização de ordem
      if (order) {
        if (!order.conterStarted) {
          await startOrderCounter({ orderId: order.id, quantity: point.value });
          logger.debug(` Ordem ${order.id}: contagem iniciada`);
        } else {
          await updateOrderFinalQuantity({
            orderId: order.id,
            finalQuantity: point.value,
          });
        }
      }

      // 🔹 Determina a hora agrupada (início da hora)
      const hour = new Date(timestamp);
      hour.setMinutes(0, 0, 0);

      // const lastMetric = await LastMetricStore.get(workcenter.name);
      const lastMetric = await MetricStateStore.get({
        workcenterId: workcenter.id,
      });

      // 🔹 Cria ou atualiza metrica de produção
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
        logger.debug("erro ao criar ou atualizar metricas");
        continue;
      }

      try {
        // 🔹 Atualiza metrica anterior, se a o id da metrica atual for diferente do id da metrica anterior
        // if (lastMetric && lastMetric !== metric.productionMetric.id) {
        //   await updateProductionMetric({
        //     id: lastMetric,
        //     finalQuantity: point.value,
        //     finalTime: timestamp,
        //   });
        //   logger.debug(
        //     `✅ ${workcenter.name}: Metrica anterior atualizada e nova metrica registrada`,
        //   );
        // } else {
        //   logger.debug(
        //     `✅ ${workcenter.name}: Metrica atualizada - Quantidade Final: ${metric.productionMetric.finalQuantity}`,
        //   );
        // }

        // await LastMetricStore.set(workcenter.name, {
        //   id: metric.productionMetric.id,
        // });

        if (lastMetric && lastMetric === metric.productionMetric.id) {
          logger.debug(
            ` ${workcenter.name}: Metrica atualizada - Quantidade Final: ${metric.productionMetric.finalQuantity}`,
          );
        } else {
          await MetricStateStore.set({
            workcenterId: workcenter.id,
            metricId: metric.productionMetric.id,
          });

          if (lastMetric) {
            await updateProductionMetric({
              id: lastMetric,
              finalQuantity: point.value,
              finalTime: timestamp,
            });
            logger.debug(
              ` ${workcenter.name}: Metrica anterior atualizada e nova metrica registrada`,
            );
          }
        }
      } catch (err) {
        if (err instanceof Error) {
          logger.error(
            { err },
            ` ${workcenter.name}: Erro ao atualizar ultima metrica`,
          );
        } else {
          logger.error(
            `${workcenter.name}: Erro desconhecido ao atualizar ultima metrica`,
          );
        }
      }

      // 🔹 Recupera o último valor registrado do contador
      const lastCounter = await CounterStateStore.get({
        workcenterId: workcenter.id,
      });

      const lastDowntime = await DowntimeStateStore.get({
        workcenterId: workcenter.id,
      });

      // if (!lastCounter) {
      //   // Primeira vez: grava o contador atual
      //   await LastCounterStore.set(workcenter.name, {
      //     value: point.value,
      //     timestamp: timestamp.toISOString(),
      //   });
      //   continue;
      // }
      if (!lastCounter) {
        // Primeira vez: grava o contador atual
        await CounterStateStore.set({
          workcenterId: workcenter.id,
          value: point.value,
          timestamp: timestamp,
        });
        continue;
      }

      const diffSeconds =
        (timestamp.getTime() - new Date(lastCounter.timestamp).getTime()) /
        1000;

      // 🔹 Atualização do status do WorkCenter
      if (!order) {
        if (workcenter.status !== WorkCenterStatus.NO_PROGRAM) {
          await updateWorkcenterStatus({
            workcenterId: workcenter.id,
            status: WorkCenterStatus.NO_PROGRAM,
          });
        }
      } else if (
        point.value === lastCounter.value &&
        diffSeconds >= ENV.DOWNTIME_THRESHOLD_SECONDS
      ) {
        if (workcenter.status !== WorkCenterStatus.STOPPED) {
          await updateWorkcenterStatus({
            workcenterId: workcenter.id,
            status: WorkCenterStatus.STOPPED,
          });
        }
      } else if (
        point.value > lastCounter?.value ||
        (point.value === lastCounter?.value &&
          diffSeconds < ENV.DOWNTIME_THRESHOLD_SECONDS)
      ) {
        if (workcenter.status !== WorkCenterStatus.PRODUCTION) {
          await updateWorkcenterStatus({
            workcenterId: workcenter.id,
            status: WorkCenterStatus.PRODUCTION,
          });
        }
      }

      // 🔹 Caso contador aumente → atualiza lastCounter e encerra downtime (se houver)
      if (point.value > lastCounter.value) {
        await CounterStateStore.set({
          workcenterId: workcenter.id,
          value: point.value,
          timestamp: timestamp,
        });

        if (lastDowntime) {
          await DowntimeStateStore.delete({ workcenterId: workcenter.id });
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
          // ➕ Cria nova parada quando não há parada ja criada
          const downtime = await createDowntime({
            workCenterId: workcenter.id,
            orderId: order?.id ?? null,
            productionMetricsId: metric.productionMetric.id,
            startTime: new Date(lastCounter.timestamp),
            endTime: timestamp,
            shiftId: shift.id,
          });
          logger.debug(
            ` ${workcenter.name}: Nova Parada Criada - Inicio: ${downtime.startTime} - Fim: ${downtime.endTime}`,
          );

          const interval = await createIntervalDowntime({
            downtimeId: downtime.id,
            metrics: metric.productionMetric,
            startTime: new Date(lastCounter.timestamp),
            endTime: timestamp,
          });
          logger.debug(
            `  ${workcenter.name}: Nova Intervalo de parada Criado - Inicio: ${interval.startTime} - Fim: ${interval.endTime}`,
          );

          // await LastDowntimeStore.set(workcenter.name, {
          //   downtimeId: downtime.id,
          //   intervalId: interval.id,
          //   productionMetricsId: metric.productionMetric.id,
          //   startTime: lastCounter.timestamp,
          // });
          await DowntimeStateStore.set({
            workcenterId: workcenter.id,
            data: {
              downtimeId: downtime.id,
              intervalId: interval.id,
              productionMetricsId: metric.productionMetric.id,
              startTime: lastCounter.timestamp,
            },
          });
        } else {
          // 🔄 Parada já aberta → atualizar parada
          let updatedDowntime = await updateDowntime({
            downtimeId: lastDowntime.downtimeId,
            endTime: timestamp,
          });
          logger.debug(
            ` ${workcenter.name}: Parada atualizada:  Inicio: ${updatedDowntime.startTime} - Fim: ${updatedDowntime.endTime} `,
          );

          if (
            updatedDowntime.shiftId !== shift.id ||
            updatedDowntime.orderId !== (order ? order.id : null)
          ) {
            updatedDowntime = await createDowntime({
              workCenterId: workcenter.id,
              orderId: order?.id ?? null,
              productionMetricsId: metric.productionMetric.id,
              startTime: timestamp,
              endTime: timestamp,
              shiftId: shift.id,
            });
          }

          const intervalUpserted = await upsertIntervalDowntime({
            downtimeId: updatedDowntime.id,
            metrics: metric.productionMetric,
            timestamp: timestamp,
          });
          logger.debug(
            ` ${workcenter.name}: Intervalo de parada de atualizado - Inicio: ${intervalUpserted.startTime} - Fim: ${intervalUpserted.endTime}`,
          );

          // Caso a interval.id mude, atualiza ultimo intervalo e arquivo
          if (intervalUpserted.id !== lastDowntime.intervalId) {
            // Atualiza EndTime do intervalo com id Anterior
            const intervalUpdated = await updateIntervalDowntime({
              id: lastDowntime.intervalId,
              endTime: timestamp,
            });
            logger.debug(
              ` ${workcenter.name}: Intervalo de parada Antigo atualizado: - Inicio: ${intervalUpdated.startTime} - Fim: ${intervalUpdated.endTime}`,
            );

            // await LastDowntimeStore.set(workcenter.name, {
            //   ...lastDowntime,
            //   intervalId: intervalUpserted.id,
            //   productionMetricsId: metric.productionMetric.id,
            // });
            await DowntimeStateStore.set({
              workcenterId: workcenter.id,
              data: {
                downtimeId: updatedDowntime.id,
                intervalId: intervalUpserted.id,
                productionMetricsId: metric.productionMetric.id,
                startTime: lastCounter.timestamp,
              },
            });
          }
        }
      }
      lastProcessedDate = timestamp;
    }

    const lastTimestamp = points[points.length - 1].time;
    await ProcessedStateStore.set({
      workcenterId: workcenter.id,
      isoTime: lastTimestamp,
    });
    return { success: true };
  } catch (err: unknown) {
    if (err instanceof Error) {
      logger.error(
        { err },
        ` Erro ao Processar Workcenter: ${workcenter.name}: `,
      );
    } else {
      logger.error(
        ` Erro desconhecido ao Processar Workcenter: ${workcenter.name}`,
      );
    }
    return { success: false };
  }
}
