import { Router } from "express";
import { exampleController } from "../controllers/exampleController.js";

const router = Router();

router.get("/example", exampleController);

export default router;
