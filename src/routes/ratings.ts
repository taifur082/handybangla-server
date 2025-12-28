import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";

export const ratingsRouter = Router();

// Create a rating (customer only, for completed bookings)
ratingsRouter.post(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.userRole !== "CUSTOMER") {
        const error: ApiError = new Error("Only customers can rate bookings");
        error.status = 403;
        return next(error);
      }

      const ratingSchema = z.object({
        bookingId: z.string().uuid(),
        rating: z.number().min(1).max(5),
        comment: z.string().optional(),
      });

      const validated = ratingSchema.parse(req.body);
      const customerId = req.userId!;

      // Verify booking exists, is completed, and belongs to customer
      const booking = await prisma.booking.findUnique({
        where: { id: validated.bookingId },
        include: { rating: true },
      });

      if (!booking) {
        const error: ApiError = new Error("Booking not found");
        error.status = 404;
        return next(error);
      }

      if (booking.customerId !== customerId) {
        const error: ApiError = new Error("You can only rate your own bookings");
        error.status = 403;
        return next(error);
      }

      if (booking.status !== "COMPLETED") {
        const error: ApiError = new Error("You can only rate completed bookings");
        error.status = 400;
        return next(error);
      }

      if (booking.rating) {
        const error: ApiError = new Error("This booking has already been rated");
        error.status = 400;
        return next(error);
      }

      // Create rating
      const rating = await prisma.rating.create({
        data: {
          rating: validated.rating,
          comment: validated.comment || null,
          bookingId: validated.bookingId,
          serviceId: booking.serviceId,
          customerId,
        },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Update service average rating and total reviews
      const serviceRatings = await prisma.rating.findMany({
        where: { serviceId: booking.serviceId },
        select: { rating: true },
      });

      const totalRating = serviceRatings.reduce((sum, r) => sum + r.rating, 0);
      const averageRating = totalRating / serviceRatings.length;
      const totalReviews = serviceRatings.length;

      await prisma.service.update({
        where: { id: booking.serviceId },
        data: {
          averageRating: averageRating.toFixed(2),
          totalReviews,
        },
      });

      res.status(201).json({ rating });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const err: ApiError = new Error("Validation error");
        err.status = 400;
        err.details = error.issues;
        return next(err);
      }
      next(error);
    }
  }
);

// Get ratings for a service (public)
ratingsRouter.get("/service/:serviceId", async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    if (!serviceId) {
      const error: ApiError = new Error("Service ID is required");
      error.status = 400;
      return next(error);
    }

    const ratings = await prisma.rating.findMany({
      where: { serviceId },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ ratings });
  } catch (error) {
    next(error);
  }
});

// Get rating for a booking (authenticated)
ratingsRouter.get(
  "/booking/:bookingId",
  authenticate,
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

      const rating = await prisma.rating.findUnique({
        where: { bookingId },
        include: {
          customer: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      res.json({ rating });
    } catch (error) {
      next(error);
    }
  }
);