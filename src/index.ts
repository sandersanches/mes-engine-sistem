import { collectMetrics } from "@/collectMetrics";

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
    setTimeout(mainLoop, 5000);
  }
}

mainLoop();
