import type { Request, Response, NextFunction } from "express";
import { authenticate, type AuthenticatedRequest } from "./auth";
import type { ApiError } from "./errorHandler";

// Re-export AuthenticatedRequest for use in admin routes
export type { AuthenticatedRequest };

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.userRole !== "ADMIN") {
    const error: ApiError = new Error("Admin access required");
    error.status = 403;
    return next(error);
  }
  next();
};

// Combined middleware: authenticate + require admin
export const adminAuth = [authenticate, requireAdmin];