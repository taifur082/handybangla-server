import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, type AuthenticatedRequest } from "../middleware/auth";
import type { Response, NextFunction } from "express";
import type { ApiError } from "../middleware/errorHandler";

export const notificationsRouter = Router();

// All routes require authentication
notificationsRouter.use(authenticate);

// Get all notifications for current user
notificationsRouter.get("/", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { unreadOnly } = req.query;

    const where: any = { userId };
    if (unreadOnly === "true") {
      where.read = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

// Get unread count
notificationsRouter.get("/unread-count", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    const count = await prisma.notification.count({
      where: {
        userId,
        read: false,
      },
    });

    res.json({ count });
  } catch (error) {
    next(error);
  }
});

// Mark notification as read
notificationsRouter.patch("/:id/read", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Validate id parameter
    if (!id) {
      const error: ApiError = new Error("Notification ID is required");
      error.status = 400;
      return next(error);
    }

    const notification = await prisma.notification.updateMany({
      where: {
        id,
        userId, // Ensure user can only update their own notifications
      },
      data: {
        read: true,
      },
    });

    if (notification.count === 0) {
      const error: ApiError = new Error("Notification not found");
      error.status = 404;
      return next(error);
    }

    res.json({ message: "Notification marked as read" });
  } catch (error) {
    next(error);
  }
});

// Mark all notifications as read
notificationsRouter.patch("/read-all", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;

    await prisma.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
});

// Delete notification
notificationsRouter.delete("/:id", async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    // Validate id parameter
    if (!id) {
      const error: ApiError = new Error("Notification ID is required");
      error.status = 400;
      return next(error);
    }

    const notification = await prisma.notification.deleteMany({
      where: {
        id,
        userId, // Ensure user can only delete their own notifications
      },
    });

    if (notification.count === 0) {
      const error: ApiError = new Error("Notification not found");
      error.status = 404;
      return next(error);
    }

    res.json({ message: "Notification deleted" });
  } catch (error) {
    next(error);
  }
});