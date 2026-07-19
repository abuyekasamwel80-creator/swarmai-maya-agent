import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Supabase direct connection URL (postgres://...) takes priority over DATABASE_URL
const connectionString =
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL;

const useInMemoryFallback = !connectionString;

function createInMemoryDb() {
  const state = {
    mayaConversations: [] as Array<Record<string, unknown>>,
    mayaMessages: [] as Array<Record<string, unknown>>,
    swarmTasks: [] as Array<Record<string, unknown>>,
    taskRuns: [] as Array<Record<string, unknown>>,
    agentResults: [] as Array<Record<string, unknown>>,
    memoryNodes: [] as Array<Record<string, unknown>>,
    tradingStrategies: [] as Array<Record<string, unknown>>,
    backtestResults: [] as Array<Record<string, unknown>>,
    paperTrades: [] as Array<Record<string, unknown>>,
    githubConfigs: [] as Array<Record<string, unknown>>,
  } as Record<string, Array<Record<string, unknown>>>;

  const resolveTableName = (table: unknown) => {
    if (typeof table === "string") return table;
    if (table && typeof table === "object") {
      const candidate = table as Record<string, unknown>;
      const symbolName = Object.getOwnPropertySymbols(candidate).find((sym) =>
        String(sym).includes("drizzle:table") || String(sym).includes("drizzle")
      );
      if (symbolName) {
        const symbolValue = candidate[symbolName as unknown as string] as { name?: string } | undefined;
        if (symbolValue?.name) return symbolValue.name;
      }
      if (typeof candidate.name === "string") return candidate.name;
      if (typeof candidate.tableName === "string") return candidate.tableName;
      if (typeof candidate.table === "string") return candidate.table;
    }
    return "unknown";
  };

  const ensureTable = (table: unknown) => {
    const key = resolveTableName(table);
    if (!state[key]) state[key] = [];
    return key;
  };

  const getRows = (table: unknown) => state[ensureTable(table)] ?? [];

  const applyWhere = (rows: Array<Record<string, unknown>>, where?: unknown) => {
    if (!where) return rows;
    const clause = where as Record<string, unknown>;
    if (clause && typeof clause === "object" && "queryChunks" in clause) {
      const query = String((clause as { queryChunks: unknown[] }).queryChunks?.map((chunk: unknown) => (typeof chunk === "string" ? chunk : "")).join(""));
      const match = query.match(/\b(\w+)\s*=\s*'([^']+)'/);
      if (match) {
        const [, field, value] = match;
        return rows.filter((row) => String(row[field]) === value);
      }
    }
    return rows;
  };

  const applyOrderBy = (rows: Array<Record<string, unknown>>, orderBy?: unknown) => {
    if (!orderBy) return rows;
    return [...rows].sort((a, b) => {
      const col = orderBy as { column?: { name?: string }; desc?: boolean } | undefined;
      const field = col?.column?.name ?? "createdAt";
      const left = a[field];
      const right = b[field];
      if (left == null || right == null) return 0;
      if (left > right) return col?.desc ? -1 : 1;
      if (left < right) return col?.desc ? 1 : -1;
      return 0;
    });
  };

  const createSelectBuilder = (table: unknown) => {
    let rows = getRows(table);
    let whereClause: unknown;
    let orderClause: unknown;

    const builder = {
      where: (clause: unknown) => {
        whereClause = clause;
        rows = applyWhere(rows, clause);
        return builder;
      },
      orderBy: (clause: unknown) => {
        orderClause = clause;
        rows = applyOrderBy(rows, clause);
        return builder;
      },
      limit: async (count?: number) => rows.slice(0, count ?? rows.length),
      then: (resolve: (value: Array<Record<string, unknown>>) => unknown) => Promise.resolve(rows).then(resolve),
      catch: (reject: (reason?: unknown) => unknown) => Promise.resolve(rows).catch(reject),
      finally: (callback: () => void) => Promise.resolve(rows).finally(callback),
    };

    return builder;
  };

  const createInsertBuilder = (table: unknown) => {
    const insert = (value: Record<string, unknown>) => {
      const key = ensureTable(table);
      state[key].push(value);
      return { rows: [value] };
    };

    return {
      values: (value: Record<string, unknown>) => {
        const result = {
          onConflictDoNothing: async () => insert(value),
          then: (resolve: (value: { rows: Array<Record<string, unknown>> }) => unknown) => Promise.resolve(insert(value)).then(resolve),
          catch: (reject: (reason?: unknown) => unknown) => Promise.resolve(insert(value)).catch(reject),
          finally: (callback: () => void) => Promise.resolve(insert(value)).finally(callback),
        };
        return result;
      },
    };
  };

  const createUpdateBuilder = (table: unknown) => ({
    set: (value: Record<string, unknown>) => ({
      where: async (clause: unknown) => {
        const key = ensureTable(table);
        const rows = state[key] ?? [];
        const filtered = applyWhere(rows, clause);
        filtered.forEach((row) => Object.assign(row, value));
        return { rows: filtered };
      },
    }),
  });

  const createDeleteBuilder = (table: unknown) => ({
    where: async (clause: unknown) => {
      const key = ensureTable(table);
      const rows = state[key] ?? [];
      const filtered = applyWhere(rows, clause);
      state[key] = rows.filter((row) => !filtered.includes(row));
      return { rows: filtered };
    },
  });

  return {
    select: () => ({
      from: (table: unknown) => createSelectBuilder(table),
    }),
    insert: (table: unknown) => createInsertBuilder(table),
    update: (table: unknown) => createUpdateBuilder(table),
    delete: (table: unknown) => createDeleteBuilder(table),
    __state: state,
  };
}

function createPool(): pg.Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Auto-reconnect: remove errored clients so the pool recovers automatically
  pool.on("error", (err) => {
    console.error("[db] idle client error — pool will recover:", err.message);
  });

  return pool;
}

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export const pool = useInMemoryFallback
  ? ({ query: async () => ({ rows: [] }) } as unknown as pg.Pool)
  : createPool();

export const db: DbClient = useInMemoryFallback
  ? (createInMemoryDb() as unknown as DbClient)
  : drizzle(pool, { schema });

export * from "./schema";
