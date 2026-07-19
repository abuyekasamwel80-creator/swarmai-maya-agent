import { getAllStats, getProviderStats } from "./rate-limiter.js";
import { ALL_MODELS } from "../models/registry.js";

export interface FleetHealth {
  totalModels: number; nvidiaModels: number; openrouterModels: number;
  totalTheoreticalRpm: number; nvidiaRpm: number; openrouterRpm: number;
  currentInflight: number; currentQueued: number; utilizationPct: number;
  nvidia: ReturnType<typeof getProviderStats>; openrouter: ReturnType<typeof getProviderStats>;
  topBusyModels: Array<{ id: string; inflight: number; queued: number }>;
}

export function getFleetHealth(): FleetHealth {
  const allStats = getAllStats();
  const nvidia = getProviderStats("nvidia");
  const openrouter = getProviderStats("openrouter");
  const nvidiaModels = ALL_MODELS.filter((m) => m.provider === "nvidia").length;
  const openrouterModels = ALL_MODELS.filter((m) => m.provider === "openrouter").length;
  const totalTheoreticalRpm = nvidia.totalRpm + openrouter.totalRpm;
  let currentInflight = 0; let currentQueued = 0;
  const busy: Array<{ id: string; inflight: number; queued: number }> = [];
  for (const [id, s] of Object.entries(allStats)) {
    currentInflight += s.inflight; currentQueued += s.queued;
    if (s.inflight > 0 || s.queued > 0) busy.push({ id, inflight: s.inflight, queued: s.queued });
  }
  busy.sort((a, b) => b.inflight + b.queued - (a.inflight + a.queued));
  const utilizationPct = totalTheoreticalRpm > 0 ? Math.round((currentInflight / (totalTheoreticalRpm / 60)) * 100) : 0;
  return { totalModels: nvidiaModels + openrouterModels, nvidiaModels, openrouterModels, totalTheoreticalRpm, nvidiaRpm: nvidia.totalRpm, openrouterRpm: openrouter.totalRpm, currentInflight, currentQueued, utilizationPct, nvidia, openrouter, topBusyModels: busy.slice(0, 10) };
}
