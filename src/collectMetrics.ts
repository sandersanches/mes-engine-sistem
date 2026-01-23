// src/collectMetrics.ts
import { fetchWorkcenters } from "./services/workcentersService";
import { fetchShifts } from "./services/shiftsService";
import { fetchOrders } from "./services/ordersService";
import { queryInfluxForWorkcenter } from "./services/metrics/influxService";
import { processWorkcenter } from "./processWorkcenter";
// import { LastProcessedStore } from "./utils/lastProcessedStore";
import { ProcessedStateStore } from "./stores/processedStateStore";
import logger from "./services/logger";

export async function collectMetrics() {
  logger.debug(" Iniciando ciclo de coleta...");

  // buscar workcenters e turnos (uma vez)
  const workcenters = await fetchWorkcenters();
  const shifts = await fetchShifts();

  // determinar janela de ordens: baseado no menor lastProcessed entre todos os WCs
  // const minIso = await LastProcessedStore.getMinTimestampIso();
  const minIso = await ProcessedStateStore.getMinTimestampIso();

  if (minIso) {
    logger.debug(` Janela de ordens baseada no menor lastProcessed: ${minIso}`);
  } else {
    logger.debug(
      " Nenhum lastProcessed encontrado — janela de ordens = ultimos 30 dias",
    );
  }

  const orders = await fetchOrders({ minIso });

  for (const wc of workcenters) {
    logger.debug(
      ` ########################################################
        Processando dados de ${wc.name}
        Status: ${wc.status}`,
    );
    try {
      // pega o lastProcessed específico deste WC para passar ao Influx
      // const lastForThis = await LastProcessedStore.get(wc.name); // pode ser null
      const lastForThis = await ProcessedStateStore.get({
        workcenterId: wc.id,
      }); // pode ser Date ou null

      const sinceIso = lastForThis ? lastForThis.toISOString() : undefined;

      const points = await queryInfluxForWorkcenter({
        workcenterName: wc.name,
        sinceIso,
      });

      if (points.length === 0) {
        logger.debug(` ${wc.name}: nenhum ponto novo.`);
        continue;
      }

      logger.debug(
        // ` ${wc.name}: ${points.length} pontos recebidos (${points[0].time} --- ${points[points.length - 1].time})`,
        ` ${wc.name}: ${points.length} pontos recebidos`,
      );

      const processedMetric = await processWorkcenter({
        workcenter: wc,
        points,
        shifts,
        orders,
      });

      if (processedMetric.success) {
        // logger.debug(`🔔 Métricas de ${wc.name} finalizadas com sucesso .`);
      } else {
        logger.debug(` Falha no apontamento das métricas de ${wc.name}.`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.error({ err }, ` Erro no WC ${wc.name}`);
      } else {
        logger.error(` Erro desconhecido no WC ${wc.name}`);
      }
    }
  }

  logger.debug(" Ciclo de coleta concluido.\n");
}
