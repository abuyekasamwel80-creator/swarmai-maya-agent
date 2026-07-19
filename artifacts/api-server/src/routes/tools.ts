import { Router } from "express";
import { getEnabledTools } from "../lib/tools/registry.js";

const router = Router();

router.get("/tools", (_req, res) => {
  res.json(getEnabledTools());
});

export default router;
