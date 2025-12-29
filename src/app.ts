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

  // app.use(helmet());
  // app.use(cors());

  // Configure CORS BEFORE Helmet
  const allowedOrigins = [
    env.FRONTEND_URL,
    "http://localhost:5173",
    "http://localhost:3000",
    "https://handybangla.vercel.app",
  ].filter(Boolean); // Remove undefined values

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, Postman, server-to-server, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // In development, allow all origins for easier testing
        if (env.NODE_ENV === "development") {
          callback(null, true);
        } else {
          // In production, reject unknown origins
          // Use callback(null, false) instead of Error for cleaner rejection
          console.warn(`CORS blocked origin: ${origin}`);
          callback(null, false);
        }
      }
    },
    credentials: true, // Allow cookies/auth headers
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    exposedHeaders: ["Content-Length", "Content-Type"], // Headers frontend can read
    maxAge: 86400, // Cache preflight requests for 24 hours
  }));

  // Configure Helmet to work with CORS
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }));

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

