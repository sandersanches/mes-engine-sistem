//src\utils\lastMetricStore.ts
import fs from "fs";
import path from "path";

const FILE_PATH = path.resolve("state", "last-metric.json");

type MetricRecord = {
  id: string;
};

type MetricState = Record<string, MetricRecord>;

function ensureFile() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE_PATH))
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
}

export const LastMetricStore = {
  async get(workcenterName: string): Promise<MetricRecord | null> {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as MetricState;
    return data[workcenterName] ?? null;
  },

  async set(workcenterName: string, record: MetricRecord): Promise<void> {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as MetricState;
    data[workcenterName] = record;
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  },

  async delete(workcenterName: string): Promise<void> {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as MetricState;
    delete data[workcenterName];
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  },
};
