import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { adminAuth, type AuthenticatedRequest } from "../middleware/adminAuth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";
import { Prisma } from "@prisma/client";

export const adminRouter = Router();

// All routes require admin authentication
adminRouter.use(adminAuth);

// Get dashboard statistics
adminRouter.get("/stats", async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const [totalUsers, totalProviders, totalCustomers, totalServices, activeServices, totalBookings, pendingBookings, completedBookings, totalRatings] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "PROVIDER" } }),
      prisma.user.count({ where: { role: "CUSTOMER" } }),
      prisma.service.count(),
      prisma.service.count({ where: { isActive: true } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: "PENDING" } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.rating.count(),
    ]);

    res.json({
      stats: {
        users: {
          total: totalUsers,
          providers: totalProviders,
          customers: totalCustomers,
        },
        services: {
          total: totalServices,
          active: activeServices,
          inactive: totalServices - activeServices,
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          completed: completedBookings,
        },
        ratings: {
          total: totalRatings,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get all users with pagination
adminRouter.get("/users", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const role = req.query.role as string | undefined;
    const search = req.query.search as string | undefined;

    const skip = (page - 1) * limit;

    const where: any = {};
    if (role) {
      where.role = role;
    }
    if (search) {
      where.OR = [
        { email: { contains: search, mode: "insensitive" } },
        { fullName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          fullName: true,
          phone: true,
          role: true,
          locationCity: true,
          locationArea: true,
          verificationBadge: true,
          createdAt: true,
          _count: {
            select: {
              services: true,
              customerBookings: true,
              providerBookings: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get user by ID
adminRouter.get("/users/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("User ID is required");
      error.status = 400;
      return next(error);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        services: {
          select: {
            id: true,
            title: true,
            category: true,
            isActive: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            customerBookings: true,
            providerBookings: true,
            ratings: true,
          },
        },
      },
    });

    if (!user) {
      const error: ApiError = new Error("User not found");
      error.status = 404;
      return next(error);
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Update user (role, verification, etc.)
adminRouter.patch("/users/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("User ID is required");
      error.status = 400;
      return next(error);
    }

    const updateSchema = z.object({
      role: z.enum(["CUSTOMER", "PROVIDER", "ADMIN"]).optional(),
      verificationBadge: z.boolean().optional(),
    });

    const validated = updateSchema.parse(req.body);

    // Build update data object, only including defined fields
    const updateData: {
      role?: "CUSTOMER" | "PROVIDER" | "ADMIN";
      verificationBadge?: boolean;
    } = {};

    if (validated.role !== undefined) {
      updateData.role = validated.role;
    }
    if (validated.verificationBadge !== undefined) {
      updateData.verificationBadge = validated.verificationBadge;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      const error: ApiError = new Error("No fields to update");
      error.status = 400;
      return next(error);
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData as { role?: "CUSTOMER" | "PROVIDER" | "ADMIN"; verificationBadge?: boolean },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        verificationBadge: true,
      },
    });

    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const err: ApiError = new Error("Validation error");
      err.status = 400;
      err.details = error.issues;
      return next(err);
    }
    next(error);
  }
});

// Delete user
adminRouter.delete("/users/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("User ID is required");
      error.status = 400;
      return next(error);
    }

    // Don't allow deleting yourself
    if (id === req.userId) {
      const error: ApiError = new Error("Cannot delete your own account");
      error.status = 400;
      return next(error);
    }

    await prisma.user.delete({
      where: { id },
    });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Get all services
adminRouter.get("/services", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const isActive = req.query.isActive === "true" ? true : req.query.isActive === "false" ? false : undefined;
    const search = req.query.search as string | undefined;

    const skip = (page - 1) * limit;

    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { category: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          provider: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
          _count: {
            select: {
              bookings: true,
              ratings: true,
            },
          },
        },
      }),
      prisma.service.count({ where }),
    ]);

    res.json({
      services,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update service (activate/deactivate)
adminRouter.patch("/services/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("Service ID is required");
      error.status = 400;
      return next(error);
    }

    const updateSchema = z.object({
      isActive: z.boolean().optional(),
    });

    const validated = updateSchema.parse(req.body);

    // Build update data object
    const updateData: { isActive?: boolean } = {};

    if (validated.isActive !== undefined) {
      updateData.isActive = validated.isActive;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      const error: ApiError = new Error("No fields to update");
      error.status = 400;
      return next(error);
    }

    const service = await prisma.service.update({
      where: { id },
      data: updateData as { isActive?: boolean },
    });

    res.json({ service });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const err: ApiError = new Error("Validation error");
      err.status = 400;
      err.details = error.issues;
      return next(err);
    }
    next(error);
  }
});

// Delete service
adminRouter.delete("/services/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("Service ID is required");
      error.status = 400;
      return next(error);
    }

    await prisma.service.delete({
      where: { id },
    });

    res.json({ message: "Service deleted successfully" });
  } catch (error) {
    next(error);
  }
});

// Get all bookings
adminRouter.get("/bookings", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined;

    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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
              email: true,
            },
          },
          provider: {
            select: {
              id: true,
              fullName: true,
              email: true,
            },
          },
        },
      }),
      prisma.booking.count({ where }),
    ]);

    res.json({
      bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update booking status
adminRouter.patch("/bookings/:id/status", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("Booking ID is required");
      error.status = 400;
      return next(error);
    }

    const updateSchema = z.object({
      status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "COMPLETED", "CANCELLED"]),
    });

    const validated = updateSchema.parse(req.body);

    const booking = await prisma.booking.update({
      where: { id },
      data: { status: validated.status },
      include: {
        service: {
          select: {
            title: true,
          },
        },
        customer: {
          select: {
            fullName: true,
          },
        },
        provider: {
          select: {
            fullName: true,
          },
        },
      },
    });

    res.json({ booking });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const err: ApiError = new Error("Validation error");
      err.status = 400;
      err.details = error.issues;
      return next(err);
    }
    next(error);
  }
});