// src/utils/lastCounterStore.ts
import fs from "fs";
import path from "path";

const FILE_PATH = path.resolve("state", "last-counter.json");

type CounterRecord = {
  value: number;
  timestamp: string; // ISO
};

type CounterState = Record<string, CounterRecord>;

function ensureFile() {
  if (!fs.existsSync(FILE_PATH)) {
    fs.writeFileSync(FILE_PATH, JSON.stringify({}, null, 2));
  }
}

export const LastCounterStore = {
  async get(workcenterName: string): Promise<CounterRecord | null> {
    ensureFile();
    const data = JSON.parse(
      fs.readFileSync(FILE_PATH, "utf-8"),
    ) as CounterState;
    return data[workcenterName] ?? null;
  },

  async set(workcenterName: string, record: CounterRecord): Promise<void> {
    ensureFile();
    const data = JSON.parse(
      fs.readFileSync(FILE_PATH, "utf-8"),
    ) as CounterState;
    data[workcenterName] = record;
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
  },
};
