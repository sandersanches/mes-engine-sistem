import "dotenv/config";
import { collectMetrics } from "./services/metrics/collect-metrics";

async function main() {
  console.log("🚀 Iniciando coleta de métricas...");

  const metrics = await collectMetrics();

  console.log("📊 Métricas coletadas:");
  console.table(metrics);
}

main().catch((err) => {
  console.error("❌ Erro na execução principal:", err);
  process.exit(1);
});
