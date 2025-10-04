import { InfluxDB } from "@influxdata/influxdb-client";

const url = process.env.INFLUX_URL as string;
const token = process.env.INFLUX_TOKEN as string;

export const influxDB = new InfluxDB({ url, token });
export const org = process.env.INFLUX_ORG as string;
export const bucket = process.env.INFLUX_BUCKET as string;
export const measurement = process.env.INFLUX_MEASUREMENT as string;
