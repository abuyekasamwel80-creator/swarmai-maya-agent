import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import modelsRouter from "./models.js";
import agentsRouter from "./agents.js";
import tasksRouter from "./tasks.js";
import memoryRouter from "./memory.js";
import githubRouter from "./github.js";
import openrouterRouter from "./openrouter.js";
import fleetRouter from "./fleet.js";
import mayaRouter from "./maya.js";
import tradingRouter from "./trading.js";
import toolsRouter from "./tools.js";
import toolExecRouter from "./tool-exec.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(agentsRouter);
router.use(tasksRouter);
router.use(memoryRouter);
router.use(githubRouter);
router.use(openrouterRouter);
router.use(fleetRouter);
router.use(mayaRouter);
router.use(tradingRouter);
router.use(toolsRouter);
router.use(toolExecRouter);

export default router;
