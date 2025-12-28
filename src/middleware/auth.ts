import type { Request, Response, NextFunction } from "express";
import { supabase } from "../lib/supabase";
import type { ApiError } from "./errorHandler";
import { prisma } from "../lib/prisma";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: "CUSTOMER" | "PROVIDER" | "ADMIN";
}

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith("Bearer ")) {
      const error: ApiError = new Error("Missing or invalid authorization header");
      error.status = 401;
      return next(error);
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      const err: ApiError = new Error("Invalid or expired token");
      err.status = 401;
      return next(err);
    }

    // Get user role from database
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true },
    });

    if (!dbUser) {
      const err: ApiError = new Error("User not found in database");
      err.status = 404;
      return next(err);
    }

    req.userId = dbUser.id;
    req.userRole = dbUser.role as "CUSTOMER" | "PROVIDER" | "ADMIN";
    next();
  } catch (error) {
    const err: ApiError = error as ApiError;
    err.status = err.status ?? 500;
    next(err);
  }
};

