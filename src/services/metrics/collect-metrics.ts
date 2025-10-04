import { getWorkCenters } from "../workcenters/get-work-centers";
import { getMetricsFromInfluxDB } from "./get-metrics-influxdb";
import { getShifts } from "../shifts/get-shifts";

export async function collectMetrics() {
  console.log("🚀 Iniciando coleta de métricas...");

  try {
    const workCenters = await getWorkCenters();
    const shifts = await getShifts();

    if (workCenters.length === 0) {
      console.warn("⚠️ Nenhum WorkCenter cadastrado no Postgres.");
      return [];
    }

    const metrics = await getMetricsFromInfluxDB(workCenters);

    const enrichedMetrics = metrics.map((m) => {
      const metricTime = new Date(m.time);

      // Converte para fuso horário local de São Paulo
      const localTime = new Date(
        metricTime.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
      );
      const hours = localTime.getHours();
      const minutes = localTime.getMinutes();
      const totalMinutes = hours * 60 + minutes;

      // Função auxiliar para saber se o horário está dentro do turno
      const findShift = () => {
        for (const s of shifts) {
          const start =
            s.startTime.getUTCHours() * 60 + s.startTime.getUTCMinutes();
          const end = s.endTime.getUTCHours() * 60 + s.endTime.getUTCMinutes();

          if (start < end) {
            // Turno normal (no mesmo dia)
            if (totalMinutes >= start && totalMinutes < end) return s.id;
          } else {
            // Turno que passa da meia-noite
            if (totalMinutes >= start || totalMinutes < end) return s.id;
          }
        }
        return null;
      };

      const shiftId = findShift();

      return {
        ...m,
        shiftId,
      };
    });

    console.log("📊 Métricas enriquecidas com turno:");
    console.table(
      enrichedMetrics.map((m) => ({
        workcenter: m.workcenter,
        time: m.time,
        value: m.value,
        shiftId: m.shiftId,
      })),
    );

    return enrichedMetrics;
  } catch (error) {
    console.error("❌ Erro ao coletar métricas:", error);
    return [];
  }
}
