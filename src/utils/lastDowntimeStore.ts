// src/utils/lastDowntimeStore.ts
import fs from "fs";
import path from "path";

const FILE_PATH = path.resolve("state", "last-downtime.json");

type DowntimeRecord = {
  downtimeId: string;
  intervalId: string;
  productionMetricsId: string;
  startTime: string;
};

type DowntimeState = Record<string, DowntimeRecord>;

/**
 * Garante que o arquivo e o diretório de estado existam.
 */
function ensureFile() {
  const dir = path.dirname(FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
  }
}

export const LastDowntimeStore = {
  /**
   * Recupera o registro de parada do workcenter informado.
   */
  async get(workcenterName: string): Promise<DowntimeRecord | null> {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as DowntimeState;
    return data[workcenterName] ?? null;
  },

  /**
   * Define ou atualiza o registro de parada do workcenter informado.
   */
  async set(workcenterName: string, record: DowntimeRecord): Promise<void> {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as DowntimeState;
    data[workcenterName] = record;
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  },

  /**
   * Remove o registro de parada do workcenter informado.
   */
  async delete(workcenterName: string): Promise<void> {
    ensureFile();
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const data = JSON.parse(raw) as DowntimeState;
    delete data[workcenterName];
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  },
};
