// src/services/metrics/get-metrics-influxdb.ts
import { InfluxDB, QueryApi } from "@influxdata/influxdb-client";
import { WorkCenter } from "@prisma/client";

const url = process.env.INFLUX_URL!;
const token = process.env.INFLUX_TOKEN!;
const org = process.env.INFLUX_ORG!;
const bucket = process.env.INFLUX_BUCKET!;
const measurement = process.env.INFLUX_MEASUREMENT!;

const influxDB = new InfluxDB({ url, token });
const queryApi: QueryApi = influxDB.getQueryApi(org);

export interface InfluxMetric {
  time: string;
  value: number;
  workcenter: string;
}

/**
 * Busca métricas do InfluxDB apenas para os workCenters cadastrados no Postgres
 */
export async function getMetricsFromInfluxDB(
  workCenters: WorkCenter[],
): Promise<InfluxMetric[]> {
  if (workCenters.length === 0) {
    console.warn("⚠️ Nenhum WorkCenter encontrado no Postgres.");
    return [];
  }

  // Monta o filtro dinâmico para os device_id correspondentes
  const filterConditions = workCenters
    .map((wc) => `r.device_id == "${wc.name}"`)
    .join(" or ");

  const fluxQuery = `
    from(bucket: "${bucket}")
      |> range(start: -30s)
      |> filter(fn: (r) => r._measurement == "${measurement}")
      |> filter(fn: (r) => ${filterConditions})
      |> keep(columns: ["_time", "_value", "device_id"])
  `;

  const metrics: InfluxMetric[] = [];

  return new Promise<InfluxMetric[]>((resolve, reject) => {
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        metrics.push({
          time: o._time as string,
          value: Number(o._value),
          workcenter: o.device_id as string,
        });
      },
      error(error) {
        console.error("❌ Erro ao consultar InfluxDB:", error);
        reject(error);
      },
      complete() {
        resolve(metrics);
      },
    });
  });
}
