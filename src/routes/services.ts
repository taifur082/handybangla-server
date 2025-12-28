import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";
import { calculateDistance, getBoundingBox } from "../lib/geolocation";
import { Prisma } from "@prisma/client";

export const servicesRouter = Router();

// Create a new service (providers only)
servicesRouter.post(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.userRole !== "PROVIDER") {
        const error: ApiError = new Error("Only providers can create services");
        error.status = 403;
        return next(error);
      }

      const serviceSchema = z.object({
        title: z.string().min(1),
        category: z.string().min(1),
        description: z.string().min(1),
        hourlyRate: z.coerce.number().positive(),
        locationCity: z.string().optional(),
        locationArea: z.string().optional(),
        latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
        longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
      });

      const validated = serviceSchema.parse(req.body);
      const providerId = req.userId!;

      // Prepare data object, converting latitude/longitude to Decimal when provided
      const serviceData: any = {
        title: validated.title,
        category: validated.category,
        description: validated.description,
        hourlyRate: validated.hourlyRate,
        providerId,
        locationCity: validated.locationCity ?? null,
        locationArea: validated.locationArea ?? null,
      };

      // Only include latitude/longitude if they're provided (not undefined)
      if (validated.latitude !== undefined && validated.latitude !== null) {
        serviceData.latitude = new Prisma.Decimal(validated.latitude);
      }
      if (validated.longitude !== undefined && validated.longitude !== null) {
        serviceData.longitude = new Prisma.Decimal(validated.longitude);
      }

      const service = await prisma.service.create({
        data: serviceData,
        include: {
          provider: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              verificationBadge: true,
            },
          },
        },
      });

      res.status(201).json({ service });
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

// Get nearby services based on location
servicesRouter.get("/nearby", async (req, res, next) => {
  try {
    const { latitude, longitude, radius = "10" } = req.query;

    if (!latitude || !longitude) {
      const error: ApiError = new Error("Latitude and longitude are required");
      error.status = 400;
      return next(error);
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);
    const radiusKm = parseFloat(radius as string);

    if (isNaN(lat) || isNaN(lon) || isNaN(radiusKm)) {
      const error: ApiError = new Error("Invalid coordinates or radius");
      error.status = 400;
      return next(error);
    }

    // Get bounding box for efficient query
    const bbox = getBoundingBox(lat, lon, radiusKm);

    // Query services within bounding box
    // Note: Prisma Decimal fields need to be converted to numbers for comparison
    const services = await prisma.service.findMany({
      where: {
        isActive: true,
        latitude: {
          not: null,
          gte: new Prisma.Decimal(bbox.minLat),
          lte: new Prisma.Decimal(bbox.maxLat),
        },
        longitude: {
          not: null,
          gte: new Prisma.Decimal(bbox.minLon),
          lte: new Prisma.Decimal(bbox.maxLon),
        },
      },
      include: {
        provider: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            verificationBadge: true,
            locationCity: true,
            locationArea: true,
          },
        },
      },
    });

    // Calculate distance for each service and filter by radius
    const servicesWithDistance = services
      .map((service) => {
        if (!service.latitude || !service.longitude) {
          return null;
        }
        const distance = calculateDistance(
          lat,
          lon,
          service.latitude,  // Pass Decimal directly
          service.longitude  // Pass Decimal directly
        );
        return {
          ...service,
          distance,
        };
      })
      .filter((service) => service !== null && service.distance !== null && service.distance <= radiusKm)
      .sort((a, b) => (a?.distance || 0) - (b?.distance || 0));

    res.json({ services: servicesWithDistance });
  } catch (error) {
    next(error);
  }
});

// Get all services with filters (public)
servicesRouter.get("/", async (req, res, next) => {
  try {
    const { category, city, minRate, maxRate, search, minRating, sortBy } = req.query;

    const where: any = {
      isActive: true,
    };

    if (category) where.category = category as string;
    if (city) where.locationCity = city as string;
    if (minRate) where.hourlyRate = { gte: parseFloat(minRate as string) };
    if (maxRate) {
      where.hourlyRate = {
        ...where.hourlyRate,
        lte: parseFloat(maxRate as string),
      };
    }
    if (minRating) {
      where.averageRating = { gte: parseFloat(minRating as string) };
    }
    if (search) {
      where.OR = [
        { title: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }

    // Determine sort order
    let orderBy: any = { createdAt: "desc" }; // Default: newest first
    if (sortBy === "rating") {
      orderBy = { averageRating: "desc" };
    } else if (sortBy === "price_low") {
      orderBy = { hourlyRate: "asc" };
    } else if (sortBy === "price_high") {
      orderBy = { hourlyRate: "desc" };
    } else if (sortBy === "newest") {
      orderBy = { createdAt: "desc" };
    } else if (sortBy === "oldest") {
      orderBy = { createdAt: "asc" };
    }

    const services = await prisma.service.findMany({
      where,
      include: {
        provider: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            verificationBadge: true,
            locationCity: true,
            locationArea: true,
          },
        },
      },
      orderBy,
      take: 100, // Increased from 50
    });

    res.json({ services });
  } catch (error) {
    next(error);
  }
});

// Get my services (provider only, includes inactive)
// ⚠️ THIS MUST BE BEFORE THE /:id ROUTE!
servicesRouter.get(
  "/my",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.userRole !== "PROVIDER") {
        const error: ApiError = new Error("Only providers can access their services");
        error.status = 403;
        return next(error);
      }

      const providerId = req.userId!;

      const services = await prisma.service.findMany({
        where: {
          providerId,
        },
        include: {
          provider: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
              verificationBadge: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({ services });
    } catch (error) {
      next(error);
    }
  }
);

// Get service by ID
servicesRouter.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const service = await prisma.service.findUnique({
      where: { id },
      include: {
        provider: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            bio: true,
            verificationBadge: true,
            locationCity: true,
            locationArea: true,
          },
        },
      },
    });

    if (!service) {
      const error: ApiError = new Error("Service not found");
      error.status = 404;
      return next(error);
    }

    res.json({ service });
  } catch (error) {
    next(error);
  }
});

// Update service (provider only, own services)
servicesRouter.put(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.userRole !== "PROVIDER") {
        const error: ApiError = new Error("Only providers can update services");
        error.status = 403;
        return next(error);
      }

      const { id } = req.params;
      const providerId = req.userId!;
      
      if (!id) {
        const error: ApiError = new Error("Service ID is required");
        error.status = 400;
        return next(error);
      }


      // Verify service belongs to provider
      const existing = await prisma.service.findUnique({
        where: { id },
      });

      if (!existing || existing.providerId !== providerId) {
        const error: ApiError = new Error("Service not found or access denied");
        error.status = 404;
        return next(error);
      }

      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        description: z.string().min(1).optional(),
        hourlyRate: z.coerce.number().positive().optional(),
        locationCity: z.string().optional().nullable(),
        locationArea: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
        latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
        longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
      });

      const validated = updateSchema.parse(req.body);

       // Filter out undefined values for Prisma
       const updateData: any = {};
       if (validated.title !== undefined) updateData.title = validated.title;
       if (validated.category !== undefined) updateData.category = validated.category;
       if (validated.description !== undefined) updateData.description = validated.description;
       if (validated.hourlyRate !== undefined) updateData.hourlyRate = validated.hourlyRate;
       if (validated.locationCity !== undefined) updateData.locationCity = validated.locationCity;
       if (validated.locationArea !== undefined) updateData.locationArea = validated.locationArea;
       if (validated.isActive !== undefined) updateData.isActive = validated.isActive;
       if (validated.latitude !== undefined) updateData.latitude = validated.latitude;
       if (validated.longitude !== undefined) updateData.longitude = validated.longitude;

      const updated = await prisma.service.update({
        where: { id },
        data: updateData,
        include: {
          provider: {
            select: {
              id: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      res.json({ service: updated });
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

// Delete service (provider only, own services)
servicesRouter.delete(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.userRole !== "PROVIDER") {
        const error: ApiError = new Error("Only providers can delete services");
        error.status = 403;
        return next(error);
      }

      const { id } = req.params;
      const providerId = req.userId!;
      
      if (!id) {
        const error: ApiError = new Error("Service ID is required");
        error.status = 400;
        return next(error);
      }

      // Verify service belongs to provider
      const existing = await prisma.service.findUnique({
        where: { id },
      });

      if (!existing || existing.providerId !== providerId) {
        const error: ApiError = new Error("Service not found or access denied");
        error.status = 404;
        return next(error);
      }

      await prisma.service.delete({
        where: { id },
      });

      res.json({ message: "Service deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
);