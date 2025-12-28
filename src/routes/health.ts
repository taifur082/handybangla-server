import { Router } from "express";

export const healthRouter = Router();

// Handle both /health and /health/
healthRouter.get("/", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});