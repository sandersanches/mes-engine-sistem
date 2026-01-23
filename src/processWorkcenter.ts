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

function diffSeconds({
  timestamp,
  lastCounterDate,
}: {
  timestamp: Date;
  lastCounterDate: Date;
}) {
  return (timestamp.getTime() - new Date(lastCounterDate).getTime()) / 1000;
}

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

      let lastCounter;

      // 🔹  Atualização de ordem
      if (order) {
        if (!order.conterStarted) {
          await startOrderCounter({ orderId: order.id, quantity: point.value });
          logger.debug(` Ordem ${order.id}: contagem iniciada`);

          lastCounter = await CounterStateStore.set({
            workcenterId: workcenter.id,
            value: point.value,
            timestamp: timestamp,
          });
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
        // Lógica para atualizar métrica anterior
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
      lastCounter = await CounterStateStore.get({
        workcenterId: workcenter.id,
      });

      let lastDowntime = await DowntimeStateStore.get({
        workcenterId: workcenter.id,
      });

      if (!lastCounter) {
        // Primeira vez: grava o contador atual
        await CounterStateStore.set({
          workcenterId: workcenter.id,
          value: point.value,
          timestamp: timestamp,
        });
        continue;
      }

      // const diffSeconds =
      //   (timestamp.getTime() - new Date(lastCounter.timestamp).getTime()) /
      //   1000;

      // 🔹 Atualização do status do WorkCenter

      // ########################################################
      // 🥇 Lógica de WorkCenter Sem Programação (NO_PROGRAM)
      // ########################################################
      if (!order) {
        if (workcenter.status !== WorkCenterStatus.NO_PROGRAM) {
          await updateWorkcenterStatus({
            workcenterId: workcenter.id,
            status: WorkCenterStatus.NO_PROGRAM,
          });
        }
        // Se NÃO houver ordem no momento, mas houver uma parada aberta (lastDowntime)
        // E essa parada aberta FOI associada a uma ordem (lastDowntime.orderId não é null),
        // precisamos encerrá-la antes de iniciar uma NO_PROGRAM.
        if (lastDowntime && lastDowntime.orderId) {
          // 1. Encerra a parada STOPPED (que estava aberta)
          await updateDowntime({
            downtimeId: lastDowntime.downtimeId,
            endTime: timestamp,
          });
          await updateIntervalDowntime({
            id: lastDowntime.intervalId,
            endTime: timestamp,
          });

          // 2. Limpa o estado para que o próximo bloco (NO_PROGRAM) crie um novo.
          lastDowntime = await DowntimeStateStore.delete({
            workcenterId: workcenter.id,
          });

          // Atualiza o lastCounter para o timestamp atual antes de iniciar o novo downtime NO_PROGRAM
          lastCounter = await CounterStateStore.set({
            workcenterId: workcenter.id,
            value: point.value,
            timestamp: timestamp,
          });
        }

        if (!lastDowntime) {
          // ➕ Cria nova parada NO_PROGRAM.
          const downtime = await createDowntime({
            workCenterId: workcenter.id,
            orderId: null,
            productionMetricsId: metric.productionMetric.id,
            startTime: timestamp,
            endTime: timestamp,
            shiftId: shift.id,
          });
          logger.debug(
            ` ${workcenter.name}: Nova Parada NO_PROGRAM Criada - Inicio: ${downtime.startTime} - Fim: ${downtime.endTime}`,
          );
          // Cria um novo intervalo de parada NO_PROGRAM.
          const interval = await createIntervalDowntime({
            downtimeId: downtime.id,
            metrics: metric.productionMetric,
            startTime: timestamp,
            endTime: timestamp,
          });
          logger.debug(
            ` ${workcenter.name}: Novo Intervalo de parada NO_PROGRAM Criado`,
          );

          // Atualiza Registro de última Parada
          await DowntimeStateStore.set({
            workcenterId: workcenter.id,
            data: {
              downtimeId: downtime.id,
              intervalId: interval.id,
              productionMetricsId: metric.productionMetric.id,
              startTime: timestamp,
              orderId: null,
            },
          });
        } else {
          // 🔄 Parada NO_PROGRAM já aberta → atualizar parada
          let updatedDowntime = await updateDowntime({
            downtimeId: lastDowntime.downtimeId,
            endTime: timestamp,
          });
          logger.debug(` ${workcenter.name}: Parada NO_PROGRAM atualizada `);

          //Se o turno não mudou
          if (updatedDowntime.shiftId === shift.id) {
            // Atualiza Intervalo
            const intervalUpserted = await upsertIntervalDowntime({
              downtimeId: updatedDowntime.id,
              metrics: metric.productionMetric,
              timestamp: timestamp,
            });

            // Caso o id do interval mude, atualiza o anterior e o estado
            if (intervalUpserted.id !== lastDowntime.intervalId) {
              await updateIntervalDowntime({
                id: lastDowntime.intervalId,
                endTime: timestamp,
              });
              await DowntimeStateStore.set({
                workcenterId: workcenter.id,
                data: {
                  downtimeId: updatedDowntime.id,
                  intervalId: intervalUpserted.id,
                  productionMetricsId: metric.productionMetric.id,
                  startTime: lastDowntime.startTime,
                  orderId: null,
                },
              });
            }
          }
          // Se o turno mudou
          else {
            // Atualiza o intervalo da parada do turno anterior
            let updatedIntervalDowntime = await updateIntervalDowntime({
              id: lastDowntime.intervalId,
              endTime: timestamp,
            });
            logger.debug(
              ` ${workcenter.name}: Intervalo de Parada NO_PROGRAM atualizada:  Inicio: ${updatedIntervalDowntime.startTime} - Fim: ${updatedIntervalDowntime.endTime} `,
            );

            //Cria nova Parada
            const newDowntime = await createDowntime({
              workCenterId: workcenter.id,
              orderId: null,
              productionMetricsId: metric.productionMetric.id,
              startTime: timestamp, // Novo turno, novo start time
              endTime: timestamp,
              shiftId: shift.id,
            });

            //Cria novo Intervalo de Parada
            const newInterval = await createIntervalDowntime({
              downtimeId: updatedDowntime.id,
              metrics: metric.productionMetric,
              startTime: timestamp,
              endTime: timestamp,
            });

            // Atualiza estado
            await DowntimeStateStore.set({
              workcenterId: workcenter.id,
              data: {
                downtimeId: newDowntime.id,
                intervalId: newInterval.id,
                productionMetricsId: metric.productionMetric.id,
                startTime: timestamp,
                orderId: null,
              },
            });

            logger.debug(
              ` ${workcenter.name}: Nova Parada NO_PROGRAM Criada após mudança de turno.`,
            );
          }
        }
      }

      // ########################################################
      // 🥈 Lógica de Encerramento de Downtime NO_PROGRAM
      // ########################################################

      if (
        order &&
        lastDowntime &&
        workcenter.status === WorkCenterStatus.NO_PROGRAM
      ) {
        // Encerra a parada NO_PROGRAM (que estava aberta)
        await updateDowntime({
          downtimeId: lastDowntime.downtimeId,
          endTime: timestamp, // Encerra no timestamp antes da produção
        });

        await updateIntervalDowntime({
          id: lastDowntime.intervalId,
          endTime: timestamp,
        });

        lastDowntime = await DowntimeStateStore.delete({
          workcenterId: workcenter.id,
        });
        logger.debug(
          ` ${workcenter.name}: Parada NO_PROGRAM encerrada pelo início da Ordem ${order.id}.`,
        );

        lastCounter = await CounterStateStore.set({
          workcenterId: workcenter.id,
          value: point.value,
          timestamp: timestamp,
        });
      }

      // ########################################################
      // 🥉 Lógica de WorkCenter em Produção (PRODUCTION)
      // ########################################################

      if (
        order &&
        (point.value > lastCounter.value ||
          (point.value === lastCounter?.value &&
            diffSeconds({ timestamp, lastCounterDate: lastCounter.timestamp }) <
              ENV.DOWNTIME_THRESHOLD_SECONDS))
      ) {
        // 🔹 Atualiza status para PRODUCTION
        if (workcenter.status !== WorkCenterStatus.PRODUCTION) {
          await updateWorkcenterStatus({
            workcenterId: workcenter.id,
            status: WorkCenterStatus.PRODUCTION,
          });
        }

        // 🔹 Caso contador aumente → atualiza lastCounter e encerra downtime (STOPPED, se houver)
        if (point.value > lastCounter.value) {
          lastCounter = await CounterStateStore.set({
            workcenterId: workcenter.id,
            value: point.value,
            timestamp: timestamp,
          });

          // Encerra downtime STOPPED
          if (lastDowntime && workcenter.status === WorkCenterStatus.STOPPED) {
            await DowntimeStateStore.delete({ workcenterId: workcenter.id });
            logger.debug(
              ` ${workcenter.name}: Parada STOPPED encerrada pelo aumento de contador.`,
            );
          }
        }
      }

      // ###########################################################
      // 🏅 Lógica de WorkCenter Parado (STOPPED) - APENAS COM ORDEM
      // ###########################################################

      if (
        order &&
        point.value === lastCounter.value &&
        diffSeconds({ timestamp, lastCounterDate: lastCounter.timestamp }) >=
          ENV.DOWNTIME_THRESHOLD_SECONDS
      ) {
        // 🔹 Atualiza status para STOPPED
        if (workcenter.status !== WorkCenterStatus.STOPPED) {
          await updateWorkcenterStatus({
            workcenterId: workcenter.id,
            status: WorkCenterStatus.STOPPED,
          });
        }
        // 🔹 Gerenciamento de Downtime STOPPED

        //  #############################
        // 🔹 Quando não há parada criada
        //  #############################
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
          logger.debug(` ${workcenter.name}: Nova Parada Criada.`);

          const interval = await createIntervalDowntime({
            downtimeId: downtime.id,
            metrics: metric.productionMetric,
            startTime: new Date(lastCounter.timestamp),
            endTime: timestamp,
          });
          logger.debug(`  ${workcenter.name}: Nova Intervalo de parada Criado`);

          await DowntimeStateStore.set({
            workcenterId: workcenter.id,
            data: {
              downtimeId: downtime.id,
              intervalId: interval.id,
              productionMetricsId: metric.productionMetric.id,
              startTime: lastCounter.timestamp,
              orderId: order.id,
            },
          });
        }

        //  #############################
        // 🔹 Quando há parada criada
        //  #############################
        else if (lastDowntime) {
          // 🔄 Parada STOPPED já aberta → atualizar parada
          let updatedDowntime = await updateDowntime({
            downtimeId: lastDowntime.downtimeId,
            endTime: timestamp,
          });
          logger.debug(` ${workcenter.name}: Parada STOPPED atualizada`);

          // Cria nova parada se o turno mudou ou a ordem mudou (dentro do estado STOPPED)
          if (
            updatedDowntime.shiftId !== shift.id ||
            updatedDowntime.orderId !== order.id
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
            ` ${workcenter.name}: Intervalo de parada STOPPED de atualizado`,
          );

          // Caso a interval.id mude, atualiza ultimo intervalo e arquivo
          if (intervalUpserted.id !== lastDowntime.intervalId) {
            // Atualiza EndTime do intervalo com id Anterior
            await updateIntervalDowntime({
              id: lastDowntime.intervalId,
              endTime: timestamp,
            });
            logger.debug(
              ` ${workcenter.name}: Intervalo de parada STOPPED Antigo atualizado`,
            );

            await DowntimeStateStore.set({
              workcenterId: workcenter.id,
              data: {
                downtimeId: updatedDowntime.id,
                intervalId: intervalUpserted.id,
                productionMetricsId: metric.productionMetric.id,
                startTime: lastCounter.timestamp,
                orderId: order.id,
              },
            });
          }
        }
      }

      // --- 🛑 FIM DA NOVA LÓGICA DE STATUS E DOWNTIME ---

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
