import { Router } from "express";
import { executeTool } from "../lib/tools/runtime.js";

const router = Router();

router.post("/tools/execute", async (req, res) => {
  try {
    const { toolId, args } = req.body as { toolId?: string; args?: Record<string, unknown> };
    if (!toolId) {
      res.status(400).json({ error: "toolId is required" });
      return;
    }
    const result = await executeTool(toolId, args ?? {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
