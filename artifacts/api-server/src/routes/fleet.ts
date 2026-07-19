/**
 * Fleet health and OS metrics endpoints.
 * Powers the dashboard's real-time capacity display.
 */
import { Router } from "express";
import { getFleetHealth } from "../lib/os/capacity-monitor.js";
import { getAllStats } from "../lib/os/rate-limiter.js";
import { ALL_MODELS } from "../lib/models/registry.js";
import { AGENT_REGISTRY } from "../lib/agents/registry.js";
import { SKILL_METADATA } from "../lib/nvidia/skills.js";

const router = Router();

/** Summary fleet health — includes per-provider N/M split */
router.get("/fleet/health", (_req, res) => {
  const health = getFleetHealth();
  res.json({
    ...health,
    agentCount: AGENT_REGISTRY.length,
    // N = NVIDIA, M = OpenRouter (M for "mixed" / community models)
    N: health.nvidiaModels,
    M: health.openrouterModels,
    nvidiaRpmCapacity: health.nvidiaRpm,
    openrouterRpmCapacity: health.openrouterRpm,
  });
});

/** Full per-model stats */
router.get("/fleet/stats", (_req, res) => {
  res.json(getAllStats());
});

/** All registered models with live utilization */
router.get("/fleet/models", (_req, res) => {
  const stats = getAllStats();
  const enriched = ALL_MODELS.map((m) => ({
    ...m,
    live: stats[m.id] ?? null,
  }));
  res.json(enriched);
});

/** NVIDIA Skills catalog — all named skills with metadata */
router.get("/fleet/skills", (_req, res) => {
  const skills = Object.entries(SKILL_METADATA).map(([id, meta]) => ({
    id,
    ...meta,
  }));
  res.json(skills);
});

export default router;
