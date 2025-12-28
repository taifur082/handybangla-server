import "dotenv/config";
import { createServer } from "http";
import { env } from "./env";
import { createApp } from "./app";
import { prisma } from "./lib/prisma";
import { initializeSocket } from "./lib/socket";
import { initializeEmailService, verifyEmailConfig } from "./lib/email";

const app = createApp();
const httpServer = createServer(app);

// Initialize email service
initializeEmailService();
if (process.env.EMAIL_ENABLED === "true") {
  verifyEmailConfig().then((isValid) => {
    if (isValid) {
      console.log("✅ Email service verified and ready");
    } else {
      console.warn("⚠️  Email service configuration invalid");
    }
  });
}

const main = async () => {
  try {
    await prisma.$connect();
    
    // Initialize Socket.io
    initializeSocket(httpServer);
    
    httpServer.listen(env.PORT, () => {
      console.log(`🚀 Server ready at http://localhost:${env.PORT}`);
      console.log(`📡 Socket.io ready`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
};

void main();

