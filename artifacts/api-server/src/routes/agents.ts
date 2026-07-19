import { Router } from "express";
import {
  AGENT_REGISTRY,
  searchAgents,
  getAgentsByDomain,
  getAgentById,
} from "../lib/agents/registry.js";

const router = Router();

router.get("/agents", (req, res) => {
  const { domain, search } = req.query as {
    domain?: string;
    search?: string;
  };

  let agents = AGENT_REGISTRY;

  if (domain) {
    agents = getAgentsByDomain(domain);
  }

  if (search) {
    const searched = searchAgents(search);
    agents = domain ? agents.filter((a) => searched.includes(a)) : searched;
  }

  res.json(agents);
});

router.get("/agents/:id", (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent) {
    res.status(404).json({ error: "Agent not found" });
    return;
  }
  res.json(agent);
});

export default router;
