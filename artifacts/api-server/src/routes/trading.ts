/**
 * Trading Engine Routes
 *
 * GET  /api/trading/orderbook/:symbol  — live order book snapshot
 * POST /api/trading/orderbook/subscribe — subscribe to symbol WS
 * GET  /api/trading/strategies         — list strategies
 * POST /api/trading/backtest           — launch swarm backtest
 * GET  /api/trading/backtests          — list backtest results
 * GET  /api/trading/paper-trades       — list paper trades
 */
import { Router } from "express";
import { db } from "@workspace/db";
import {
  tradingStrategiesTable,
  backtestResultsTable,
  paperTradesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { orderBookService } from "../lib/trading/orderbook.js";
import { runSwarmTask, runEmitters } from "../lib/swarm/orchestrator.js";
import { swarmTasksTable, taskRunsTable } from "@workspace/db";

const router = Router();

// ── Order Book ────────────────────────────────────────────────────────────────

router.post("/trading/orderbook/subscribe", (req, res) => {
  const { symbol } = req.body as { symbol: string };
  if (!symbol) {
    res.status(400).json({ error: "symbol required" });
    return;
  }
  orderBookService.subscribe(symbol.toLowerCase().replace("/", ""));
  res.json({ subscribed: symbol, total: orderBookService.getSubscribedSymbols() });
});

router.get("/trading/orderbook/:symbol", (req, res) => {
  const sym = req.params.symbol.toLowerCase();
  const book = orderBookService.getBook(sym);
  if (!book) {
    // Auto-subscribe if not yet connected
    orderBookService.subscribe(sym);
    res.status(202).json({ status: "connecting", symbol: sym });
    return;
  }
  res.json(book);
});

// ── Strategies ────────────────────────────────────────────────────────────────

router.get("/trading/strategies", async (_req, res) => {
  try {
    const strats = await db
      .select()
      .from(tradingStrategiesTable)
      .orderBy(desc(tradingStrategiesTable.createdAt));
    res.json(strats);
  } catch (err) {
    res.status(500).json({ error: "Failed to list strategies" });
  }
});

router.get("/trading/strategies/:id", async (req, res) => {
  try {
    const [strategy] = await db
      .select()
      .from(tradingStrategiesTable)
      .where(eq(tradingStrategiesTable.id, req.params.id));
    if (!strategy) {
      res.status(404).json({ error: "Strategy not found" });
      return;
    }
    res.json(strategy);
  } catch (err) {
    res.status(500).json({ error: "Failed to get strategy" });
  }
});

// ── Backtest (launches swarm) ─────────────────────────────────────────────────

router.post("/trading/backtest", async (req, res) => {
  try {
    const { strategyType = "spib", symbol = "BTCUSDT", agentCount = 50, description = "" } = req.body as {
      strategyType?: string;
      symbol?: string;
      agentCount?: number;
      description?: string;
    };

    const strategyTypeLabels: Record<string, string> = {
      spib: "State Predictive Information Bottleneck (SPIB)",
      tkan: "Temporal Kolmogorov-Arnold Network (T-KAN)",
      momentum: "Momentum / Trend Following",
      mean_reversion: "Mean Reversion",
      arbitrage: "Statistical Arbitrage",
      market_making: "Market Making",
    };

    const taskTitle = `${strategyTypeLabels[strategyType] ?? strategyType} Strategy — ${symbol}`;
    const taskDescription = [
      `Design and implement a complete ${strategyTypeLabels[strategyType] ?? strategyType} trading algorithm for ${symbol}.`,
      "",
      description || "Focus on order book microstructure, latency optimization, and risk management.",
      "",
      "Requirements:",
      "- Provide complete, executable Python code for the strategy",
      "- Include signal generation, entry/exit logic, and position sizing",
      "- Define backtesting methodology with clear metrics (Sharpe, max drawdown, win rate)",
      "- Include risk management rules (stop-loss, position limits)",
      "- Analyze alpha decay and suggest adaptation mechanisms",
      "- Optimize for sub-100ms execution latency",
    ].join("\n");

    // Create the swarm task
    const taskId = crypto.randomUUID();
    await db.insert(swarmTasksTable).values({
      id: taskId,
      title: taskTitle,
      description: taskDescription,
      domains: ["trading", "code", "data", "research", "aiml"],
      agentCount,
      status: "pending",
    });

    // Create a strategy record
    const strategyId = crypto.randomUUID();
    await db.insert(tradingStrategiesTable).values({
      id: strategyId,
      name: taskTitle,
      description: taskDescription,
      code: "# Generating...",
      language: "python",
      strategyType,
      symbol,
      status: "draft",
      agentSwarmId: taskId,
    });

    // Create a backtest record
    const backtestId = crypto.randomUUID();
    await db.insert(backtestResultsTable).values({
      id: backtestId,
      strategyId,
      symbol,
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate: new Date().toISOString().split("T")[0],
      status: "running",
      swarmTaskId: taskId,
      agentCount,
    });

    // Launch the swarm async
    const runId = crypto.randomUUID();
    await db.insert(taskRunsTable).values({
      id: runId,
      taskId,
      status: "running",
    });

    runSwarmTask(taskId, runId, agentCount).catch(console.error);

    res.status(202).json({ taskId, strategyId, backtestId, runId, status: "running" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to launch backtest" });
  }
});

// ── Backtest Results ──────────────────────────────────────────────────────────

router.get("/trading/backtests", async (_req, res) => {
  try {
    const results = await db
      .select()
      .from(backtestResultsTable)
      .orderBy(desc(backtestResultsTable.createdAt));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to list backtests" });
  }
});

// ── Paper Trades ──────────────────────────────────────────────────────────────

router.get("/trading/paper-trades", async (_req, res) => {
  try {
    const trades = await db
      .select()
      .from(paperTradesTable)
      .orderBy(desc(paperTradesTable.openedAt));
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: "Failed to list paper trades" });
  }
});

router.post("/trading/paper-trades", async (req, res) => {
  try {
    const { strategyId, symbol, side, quantity, entryPrice } = req.body;
    const id = crypto.randomUUID();
    await db.insert(paperTradesTable).values({
      id,
      strategyId,
      symbol,
      side,
      quantity,
      entryPrice,
      status: "open",
    });
    const [trade] = await db
      .select()
      .from(paperTradesTable)
      .where(eq(paperTradesTable.id, id));
    res.status(201).json(trade);
  } catch (err) {
    res.status(500).json({ error: "Failed to create paper trade" });
  }
});

export default router;
