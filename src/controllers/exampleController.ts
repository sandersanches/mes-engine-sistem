import { Request, Response } from "express";
import { exampleService } from "../services/exampleService.js";

export function exampleController(_req: Request, res: Response) {
  const message = exampleService();
  res.json({ message });
}
