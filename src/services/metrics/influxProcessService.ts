// src\services\metrics\influxProcessService.ts
import { InfluxDB } from "@influxdata/influxdb-client";
import { ENV } from "@/config/env";
import logger from "../logger"; // Importe seu logger aqui

interface InfluxRawRow {
  _value: string;
  _time: string;
  [key: string]: unknown;
}

const client = new InfluxDB({ url: ENV.INFLUX_URL, token: ENV.INFLUX_TOKEN });
const queryApi = client.getQueryApi(ENV.INFLUX_ORG);

export async function getLastValueFromInflux(params: {
  measurement: string;
  field: string;
  deviceId: string;
}): Promise<{ value: number; time: Date } | null> {
  const fluxQuery = `
    from(bucket: "${ENV.INFLUX_BUCKET}")
      |> range(start: -1h)
      |> filter(fn: (r) => r._measurement == "${params.measurement}")
      |> filter(fn: (r) => r["_field"] == "${params.field}")
      |> filter(fn: (r) => r["device_id"] == "${params.deviceId}")
      |> last()
  `;

  try {
    const result = await queryApi.collectRows<InfluxRawRow>(fluxQuery);

    if (result.length > 0) {
      return {
        value: parseFloat(result[0]._value),
        time: new Date(result[0]._time),
      };
    }
    return null;
  } catch (error) {
    // Usamos o erro no log para satisfazer o ESLint e ajudar no debug
    logger.error(
      { error },
      "Erro ao consultar InfluxDB para variáveis de processo",
    );
    return null;
  }
}
