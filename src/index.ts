//src\index.ts
import { collectMetrics } from "@/collectMetrics";
import { ENV } from "./config/env";
import logger from "./services/logger";

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

mainLoop();
