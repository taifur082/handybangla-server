import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";

export const usersRouter = Router();

// Public route: Get provider profile with services and ratings
usersRouter.get("/provider/:id", async (req, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("Provider ID is required");
      error.status = 400;
      return next(error);
    }

    // Get provider info
    const provider = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        role: true,
        locationCity: true,
        locationArea: true,
        hourlyRate: true,
        verificationBadge: true,
        createdAt: true,
      },
    });

    if (!provider) {
      const error: ApiError = new Error("Provider not found");
      error.status = 404;
      return next(error);
    }

    if (provider.role !== "PROVIDER") {
      const error: ApiError = new Error("User is not a service provider");
      error.status = 400;
      return next(error);
    }

    // Get all active services for this provider
    const services = await prisma.service.findMany({
      where: {
        providerId: id,
        isActive: true,
      },
      include: {
        ratings: {
          select: {
            rating: true,
            comment: true,
            createdAt: true,
            customer: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate overall provider rating from all services
    const allRatings = services.flatMap((service) => 
      service.ratings.map((r) => r.rating)
    );

    let overallRating = null;
    let totalReviews = 0;
    if (allRatings.length > 0) {
      const sum = allRatings.reduce((acc, rating) => acc + rating, 0);
      overallRating = sum / allRatings.length;
      totalReviews = allRatings.length;
    }

    res.json({
      provider,
      services,
      overallRating,
      totalReviews,
    });
  } catch (error) {
    next(error);
  }
});

// All routes require authentication
usersRouter.use(authenticate);

// Update user profile
usersRouter.put("/profile", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const updateSchema = z.object({
      fullName: z.string().min(1).optional(),
      phone: z.string().optional().nullable(),
      avatarUrl: z.string().url().optional().nullable(),
      bio: z.string().optional().nullable(),
      locationCity: z.string().optional().nullable(),
      locationArea: z.string().optional().nullable(),
      hourlyRate: z.coerce.number().positive().optional().nullable(),
    });

    const validated = updateSchema.parse(req.body);
    const userId = req.userId!;

    const updateData: any = {};
    if (validated.fullName !== undefined) updateData.fullName = validated.fullName;
    if (validated.phone !== undefined) updateData.phone = validated.phone;
    if (validated.avatarUrl !== undefined) updateData.avatarUrl = validated.avatarUrl;
    if (validated.bio !== undefined) updateData.bio = validated.bio;
    if (validated.locationCity !== undefined) updateData.locationCity = validated.locationCity;
    if (validated.locationArea !== undefined) updateData.locationArea = validated.locationArea;
    if (validated.hourlyRate !== undefined) updateData.hourlyRate = validated.hourlyRate;
    
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        phone: true,
        avatarUrl: true,
        bio: true,
        role: true,
        locationCity: true,
        locationArea: true,
        hourlyRate: true,
        verificationBadge: true,
      },
    });

    res.json({ user: updated });
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

// Get user by ID (public profile)
usersRouter.get("/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    if (!id) {
      const error: ApiError = new Error("User ID is required");
      error.status = 400;
      return next(error);
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        role: true,
        locationCity: true,
        locationArea: true,
        hourlyRate: true,
        verificationBadge: true,
        createdAt: true,
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