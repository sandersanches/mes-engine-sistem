// src/services/metrics/influxService.ts
import { ENV } from "@/config/env";
import { InfluxDB, QueryApi } from "@influxdata/influxdb-client";

const url = ENV.INFLUX_URL;
const token = ENV.INFLUX_TOKEN;
const org = ENV.INFLUX_ORG;
const bucket = ENV.INFLUX_BUCKET;
// const measurement = process.env.INFLUX_MEASUREMENT!;
const measurement = ENV.INFLUX_MEASUREMENT;

const influxDB = new InfluxDB({ url, token });
const queryApi: QueryApi = influxDB.getQueryApi(org);

export interface InfluxPoint {
  time: string; // ISO
  value: number;
  device_id: string;
}

/**
 * Busca pontos do Influx para um workcenter (device_id).
 * - sinceIso: ISO timestamp string. Se informado, busca a partir desse timestamp (inclusive).
 * - Caso não informado, busca uma janela curta (-1h) para evitar consumo excessivo.
 */
export async function queryInfluxForWorkcenter({
  workcenterName,
  sinceIso,
}: {
  workcenterName: string;
  sinceIso?: string;
}): Promise<InfluxPoint[]> {
  // ✅ Corrigido: o Influx exige time(v: "...") em range()
  const rangeClause = sinceIso
    ? `|> range(start: time(v: "${sinceIso}"))`
    : `|> range(start: -1h)`; // fallback

  const flux = `
    from(bucket: "${bucket}")
      ${rangeClause}
      |> filter(fn: (r) => r._measurement == "${measurement}")
      |> filter(fn: (r) => r.device_id == "${workcenterName}")
      |> keep(columns: ["_time", "_value", "device_id"])
      |> sort(columns: ["_time"], desc: false)
  `;

  const rows: InfluxPoint[] = [];

  return new Promise<InfluxPoint[]>((resolve, reject) => {
    queryApi.queryRows(flux, {
      next(row, tableMeta) {
        const obj = tableMeta.toObject(row);
        rows.push({
          time: obj._time as string,
          value: Number(obj._value),
          device_id: String(obj.device_id),
        });
      },
      error(err) {
        console.error(`❌ Erro ao consultar Influx (${workcenterName}):`, err);
        reject(err);
      },
      complete() {
        resolve(rows);
      },
    });
  });
}
