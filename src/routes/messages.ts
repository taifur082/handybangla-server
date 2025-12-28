import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";

export const messagesRouter = Router();

// All routes require authentication
messagesRouter.use(authenticate);

// Get messages for a booking
messagesRouter.get(
  "/booking/:bookingId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { bookingId } = req.params;
      const userId = req.userId!;

      if (!bookingId) {
        const error: ApiError = new Error("Booking ID is required");
        error.status = 400;
        return next(error);
      }

      // Verify user has access to this booking
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        const error: ApiError = new Error("Booking not found");
        error.status = 404;
        return next(error);
      }

      if (booking.customerId !== userId && booking.providerId !== userId) {
        const error: ApiError = new Error("Access denied");
        error.status = 403;
        return next(error);
      }

      const messages = await prisma.message.findMany({
        where: { bookingId },
        include: {
          sender: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      res.json({ messages });
    } catch (error) {
      next(error);
    }
  }
);