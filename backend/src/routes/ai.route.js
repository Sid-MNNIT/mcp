import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { aiExecute, aiChat } from "../controllers/ai.controller.js";

const router = Router();

router.post("/execute", verifyJWT, aiExecute);

router.post("/chat", verifyJWT, aiChat);

export default router;
