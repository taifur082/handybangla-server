import type { Request, Response, NextFunction } from "express";

export interface ApiError extends Error {
  status?: number;
  details?: unknown;
}

export const errorHandler = (
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.status ?? 500;
  const body = {
    message: err.message ?? "Internal server error",
    ...(err.details ? { details: err.details } : {}),
  };

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json(body);
};

