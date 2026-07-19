import { pgTable, text, integer, real, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradingStrategiesTable = pgTable("trading_strategies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  code: text("code").notNull(),
  language: text("language").notNull().default("python"),
  strategyType: text("strategy_type").notNull().default("general"),
  symbol: text("symbol").notNull().default("BTCUSDT"),
  status: text("status").notNull().default("draft"),
  agentSwarmId: text("agent_swarm_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const backtestResultsTable = pgTable("backtest_results", {
  id: text("id").primaryKey(),
  strategyId: text("strategy_id")
    .notNull()
    .references(() => tradingStrategiesTable.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  totalReturnPct: real("total_return_pct"),
  sharpeRatio: real("sharpe_ratio"),
  maxDrawdownPct: real("max_drawdown_pct"),
  winRatePct: real("win_rate_pct"),
  totalTrades: integer("total_trades"),
  profitFactor: real("profit_factor"),
  metrics: jsonb("metrics").$type<Record<string, number>>().default({}),
  status: text("status").notNull().default("running"),
  swarmTaskId: text("swarm_task_id"),
  agentCount: integer("agent_count"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paperTradesTable = pgTable("paper_trades", {
  id: text("id").primaryKey(),
  strategyId: text("strategy_id")
    .notNull()
    .references(() => tradingStrategiesTable.id, { onDelete: "cascade" }),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(),
  quantity: real("quantity").notNull(),
  entryPrice: real("entry_price").notNull(),
  exitPrice: real("exit_price"),
  pnl: real("pnl"),
  status: text("status").notNull().default("open"),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertTradingStrategySchema = createInsertSchema(tradingStrategiesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertBacktestResultSchema = createInsertSchema(backtestResultsTable).omit({
  createdAt: true,
});
export const insertPaperTradeSchema = createInsertSchema(paperTradesTable).omit({
  openedAt: true,
});

export type TradingStrategy = typeof tradingStrategiesTable.$inferSelect;
export type BacktestResult = typeof backtestResultsTable.$inferSelect;
export type PaperTrade = typeof paperTradesTable.$inferSelect;
