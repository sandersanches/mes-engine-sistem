//src\index.ts
import { collectMetrics } from "@/collectMetrics";
import { ENV } from "./config/env";
import logger from "./services/logger";
import { monitorVariables } from "./monitorVariables";

async function mainLoop() {
  try {
    await collectMetrics();
  } catch (err) {
    if (err instanceof Error) {
      logger.error({ err }, "Erro no loop principal");
    } else {
      logger.error("Erro desconhecido no loop principal");
    }
  } finally {
    // Garante que o próximo loop só começa após o anterior terminar
    setTimeout(mainLoop, ENV.METRICS_INTERVAL_SECONDS * 1000);
  }
}

// NOVO: Loop de Variáveis de Processo
async function variablesLoop() {
  if (process.env.ENABLE_VARIABLE_MONITORING !== "true") {
    logger.info("Monitoramento de variáveis desabilitado via ENV.");
    return;
  }

  try {
    await monitorVariables();
  } catch (err) {
    logger.error({ err }, "Erro no loop de variáveis");
  } finally {
    const interval = Number(process.env.VARIABLE_MONITORING_INTERVAL) || 5000;
    setTimeout(variablesLoop, interval);
  }
}

mainLoop();
variablesLoop();
