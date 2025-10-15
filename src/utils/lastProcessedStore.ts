// src/utils/lastProcessedStore.ts
import fs from "fs/promises";
import path from "path";

const STATE_DIR = path.resolve(process.cwd(), "state");
const STATE_FILE = path.join(STATE_DIR, "last-processed.json");

type StoreShape = Record<string, string>; // workCenterName -> ISO timestamp

async function ensureDir(): Promise<void> {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

async function readStore(): Promise<StoreShape> {
  try {
    await ensureDir();
    const content = await fs.readFile(STATE_FILE, "utf8");
    return JSON.parse(content) as StoreShape;
  } catch (err: unknown) {
    if (isENOENT(err)) return {};
    throw err;
  }
}

async function writeStore(obj: StoreShape): Promise<void> {
  await ensureDir();
  const tmp = STATE_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fs.rename(tmp, STATE_FILE);
}

export const LastProcessedStore = {
  async get(workCenterName: string): Promise<string | null> {
    const s = await readStore();
    return s[workCenterName] ?? null;
  },

  async set(workCenterName: string, isoTime: string): Promise<void> {
    const s = await readStore();
    s[workCenterName] = isoTime;
    await writeStore(s);
  },

  async getAll(): Promise<StoreShape> {
    return readStore();
  },

  /** Retorna o menor timestamp ISO presente no arquivo, ou null */
  async getMinTimestampIso(): Promise<string | null> {
    const s = await readStore();
    const vals = Object.values(s).filter(Boolean);
    if (vals.length === 0) return null;
    // ISO strings são comparáveis lexicograficamente
    const min = vals.reduce((a, b) => (a < b ? a : b));
    return min;
  },

  async clear(): Promise<void> {
    await writeStore({});
  },
};
