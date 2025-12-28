import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./env";
// import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { usersRouter } from "./routes/users";
import { servicesRouter } from "./routes/services";
import { bookingsRouter } from "./routes/bookings";
import { ratingsRouter } from "./routes/ratings";
import { notFoundHandler } from "./middleware/notFound";
import { errorHandler } from "./middleware/errorHandler";
import { messagesRouter } from "./routes/messages";
import { adminRouter } from "./routes/admin";

export const createApp = () => {
  const app = express();

  app.set("trust proxy", env.NODE_ENV === "production");

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  
  // Routes
  app.get("/", (_req, res) => {
    res.send("Okay");
  });
  
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });
  // Routes 
  // app.use("/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/ratings", ratingsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/admin", adminRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

