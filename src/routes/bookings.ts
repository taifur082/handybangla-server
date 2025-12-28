import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";
import { notifyBookingStatusChange, notifyBookingCreated } from "../lib/notifications";

export const bookingsRouter = Router();

// All routes require authentication
bookingsRouter.use(authenticate);

// Create a booking request
bookingsRouter.post("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    console.log('Booking creation request:', { 
      userId: req.userId, 
      role: req.userRole, 
      body: req.body 
    }); // Debug log

    if (req.userRole !== "CUSTOMER") {
      const error: ApiError = new Error("Only customers can create bookings");
      error.status = 403;
      return next(error);
    }

    const bookingSchema = z.object({
      serviceId: z.string().uuid(),
      description: z.string().optional(),
      address: z.string().optional(),
      scheduledFor: z.string().optional(),
    });

    console.log('Validating booking data...'); // Debug log
    const validated = bookingSchema.parse(req.body);
    const customerId = req.userId!;

    console.log('Looking up service:', validated.serviceId); // Debug log
    // Verify service exists and get provider
    const service = await prisma.service.findUnique({
      where: { id: validated.serviceId },
      include: { provider: true },
    });

    if (!service || !service.isActive) {
      console.error('Service not found or inactive:', validated.serviceId); // Debug log
      const error: ApiError = new Error("Service not found or inactive");
      error.status = 404;
      return next(error);
    }

    console.log('Service found, creating booking...'); // Debug log
    console.log('Booking data:', {
      serviceId: validated.serviceId,
      customerId,
      providerId: service.providerId,
      description: validated.description,
      address: validated.address,
      scheduledFor: validated.scheduledFor,
    }); // Debug log

    const booking = await prisma.booking.create({
      data: {
        serviceId: validated.serviceId,
        customerId,
        providerId: service.providerId,
        description: validated.description ?? null,
        address: validated.address ?? null,
        scheduledFor: validated.scheduledFor ? new Date(validated.scheduledFor) : null,
        responseDueAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes to respond
      },
      include: {
        service: {
          select: {
            id: true,
            title: true,
            category: true,
            hourlyRate: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        provider: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    console.log('Booking created successfully:', booking.id); // Debug log
    
    // Send response FIRST, then handle notification asynchronously
    res.status(201).json({ booking });
    
    // Send notification asynchronously (don't block response)
    notifyBookingCreated(booking).catch((err) => {
      console.error('Failed to send booking notification:', err);
      // Don't throw - notification failure shouldn't break booking creation
    });
  } catch (error) {
    console.error('Booking creation error:', error); // Debug log
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.issues); // Debug log
      const err: ApiError = new Error("Validation error");
      err.status = 400;
      err.details = error.issues;
      return next(err);
    }
    next(error);
  }
});

// Get bookings (filtered by user role)
bookingsRouter.get("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const userRole = req.userRole!;
    const { status } = req.query;

    const where: any = {};

    if (userRole === "CUSTOMER") {
      where.customerId = userId;
    } else if (userRole === "PROVIDER") {
      where.providerId = userId;
    }

    if (status) {
      where.status = status as string;
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        service: {
          select: {
            id: true,
            title: true,
            category: true,
            hourlyRate: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        provider: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ bookings });
  } catch (error) {
    next(error);
  }
});

// Update booking status (provider: accept/decline, customer: cancel)
bookingsRouter.patch(
  "/:id/status",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.userId!;
      const userRole = req.userRole!;

      const statusSchema = z.object({
        status: z.enum(["ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED"]),
      });

      const { status } = statusSchema.parse(req.body);
      
      if (!id) {
        const error: ApiError = new Error("Booking ID is required");
        error.status = 400;
        return next(error);
        }
      // Get booking and verify permissions
      const booking = await prisma.booking.findUnique({
        where: { id },
      });

      if (!booking) {
        const error: ApiError = new Error("Booking not found");
        error.status = 404;
        return next(error);
      }

      // Check permissions
      if (userRole === "PROVIDER" && booking.providerId !== userId) {
        const error: ApiError = new Error("Access denied");
        error.status = 403;
        return next(error);
      }

      if (userRole === "CUSTOMER" && booking.customerId !== userId) {
        const error: ApiError = new Error("Access denied");
        error.status = 403;
        return next(error);
      }

      // Validate status transitions
      if (userRole === "PROVIDER") {
        // Providers can mark ACCEPTED bookings as COMPLETED
        if (status === "COMPLETED" && booking.status !== "ACCEPTED") {
          const error: ApiError = new Error("Can only complete accepted bookings");
          error.status = 400;
          return next(error);
        }
        // Providers can accept/decline PENDING bookings
        if (["ACCEPTED", "DECLINED"].includes(status) && booking.status !== "PENDING") {
          const error: ApiError = new Error("Can only accept or decline pending bookings");
          error.status = 400;
          return next(error);
        }
        // Providers can only use these statuses
        if (!["ACCEPTED", "DECLINED", "COMPLETED"].includes(status)) {
          const error: ApiError = new Error("Invalid status for provider");
          error.status = 400;
          return next(error);
        }
      }

      if (userRole === "CUSTOMER" && status !== "CANCELLED" && booking.status !== "PENDING") {
        const error: ApiError = new Error("Can only cancel pending bookings");
        error.status = 400;
        return next(error);
      }

      
      const updated = await prisma.booking.update({
        where: { id },
        data: { status },
        include: {
          service: {
            select: {
              id: true,
              title: true,
              category: true,
            },
          },
          customer: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
          provider: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      res.json({ booking: updated });
      
      // Use the updated booking with relations for notification
      await notifyBookingStatusChange(updated, status).catch((err) => {
        console.error('Failed to send booking status notification:', err);
      });
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