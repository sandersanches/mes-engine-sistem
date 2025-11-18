// src/collectMetrics.ts
import { fetchWorkcenters } from "./services/workcentersService";
import { fetchShifts } from "./services/shiftsService";
import { fetchOrders } from "./services/ordersService";
import { queryInfluxForWorkcenter } from "./services/metrics/influxService";
import { processWorkcenter } from "./processWorkcenter";
// import { LastProcessedStore } from "./utils/lastProcessedStore";
import { ProcessedStateStore } from "./stores/processedStateStore";

export async function collectMetrics() {
  console.log("🚀 Iniciando ciclo de coleta...");

  // buscar workcenters e turnos (uma vez)
  const workcenters = await fetchWorkcenters();
  const shifts = await fetchShifts();

  // determinar janela de ordens: baseado no menor lastProcessed entre todos os WCs
  // const minIso = await LastProcessedStore.getMinTimestampIso();
  const minIso = await ProcessedStateStore.getMinTimestampIso();

  if (minIso) {
    console.log("Janela de ordens baseada no menor lastProcessed:", minIso);
  } else {
    console.log(
      "Nenhum lastProcessed encontrado — janela de ordens = últimos 30 dias",
    );
  }

  const orders = await fetchOrders({ minIso });

  for (const wc of workcenters) {
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
        console.log(`⏸️  ${wc.name}: nenhum ponto novo.`);
        continue;
      }

      console.log(
        `📈 ${wc.name}: ${points.length} pontos recebidos (${points[0].time} → ${points[points.length - 1].time})`,
      );

      const processedMetric = await processWorkcenter({
        workcenter: wc,
        points,
        shifts,
        orders,
      });

      if (processedMetric.success) {
        // console.log(`🔔 Métricas de ${wc.name} finalizadas com sucesso .`);
      } else {
        console.log(`ℹ️ Falha no apontamento das métricas de ${wc.name}.`);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(`❌ Erro no WC ${wc.name}:`, err.message);
      } else {
        console.error(`❌ Erro desconhecido no WC ${wc.name}`);
      }
    }
  }

  console.log("✅ Ciclo de coleta concluído.\n");
}
