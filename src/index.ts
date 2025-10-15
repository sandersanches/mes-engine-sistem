//src\index.ts
import { collectMetrics } from "@/collectMetrics";
import { ENV } from "./config/env";

async function mainLoop() {
  try {
    await collectMetrics();
  } catch (err) {
    if (err instanceof Error) {
      console.error("Erro no loop principal:", err.message);
    } else {
      console.error("Erro desconhecido no loop principal");
    }
  } finally {
    // Garante que o próximo loop só começa após o anterior terminar
    setTimeout(mainLoop, ENV.METRICS_INTERVAL_SECONDS * 1000);
  }
}

mainLoop();
