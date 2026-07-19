import { Router } from "express";
import { MODELS } from "../lib/models/registry.js";

const router = Router();

router.get("/models", (_req, res) => {
  res.json(MODELS);
});

export default router;
