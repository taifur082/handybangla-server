import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { prisma } from "./prisma";
import { supabaseAdmin } from "./supabase";
import { notifyMessageReceived } from "./notifications";


export let io: SocketIOServer | null = null;

export const initializeSocket = (httpServer: HTTPServer) => {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      console.log('🔐 Socket auth attempt, token present:', !!token);
      
      if (!token) {
        console.log('❌ Socket auth failed: No token');
        return next(new Error("Authentication error"));
      }

      // Use admin client to verify token (service role can verify user tokens)
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      
      if (error) {
        console.log('❌ Socket auth failed: Token verification error', error.message);
        return next(new Error("Authentication error"));
      }
      
      if (!data || !data.user) {
        console.log('❌ Socket auth failed: No user data');
        return next(new Error("Authentication error"));
      }

      console.log('✅ Token verified for user:', data.user.email);

      // Get user from database
      const user = await prisma.user.findUnique({
        where: { email: data.user.email! },
      });

      if (!user) {
        console.log('❌ Socket auth failed: User not found in DB for email:', data.user.email);
        return next(new Error("User not found"));
      }

      socket.data.userId = user.id;
      socket.data.userRole = user.role;
      console.log('✅ Socket auth successful for user:', user.id);
      next();
    } catch (error) {
      console.error('❌ Socket auth exception:', error);
      next(new Error("Authentication error"));
    }
  });

  // Connection handler - MUST be uncommented for Socket.io to work
  io.on("connection", (socket: Socket) => {
    console.log(`User connected: ${socket.data.userId}`);

    // Join user's notification room for real-time notifications
    socket.join(`user_${socket.data.userId}`);
    console.log(`User ${socket.data.userId} joined notification room`);

    // Join booking room
    socket.on("join_booking", async (bookingId: string) => {
      try {
        // Verify user has access to this booking
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
        });

        if (
          booking &&
          (booking.customerId === socket.data.userId ||
            booking.providerId === socket.data.userId)
        ) {
          socket.join(`booking:${bookingId}`);
          console.log(`User ${socket.data.userId} joined booking:${bookingId}`);
        }
      } catch (error) {
        console.error("Error joining booking room:", error);
      }
    });

    // Leave booking room
    socket.on("leave_booking", (bookingId: string) => {
      socket.leave(`booking:${bookingId}`);
      console.log(`User ${socket.data.userId} left booking:${bookingId}`);
    });

    // Send message
    socket.on("send_message", async (data: { bookingId: string; body: string }) => {
      try {
        const { bookingId, body } = data;
        const senderId = socket.data.userId;

        // Verify booking access
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
        });

        if (!booking) {
          socket.emit("error", { message: "Booking not found" });
          return;
        }

        if (booking.customerId !== senderId && booking.providerId !== senderId) {
          socket.emit("error", { message: "Access denied" });
          return;
        }

        // Create message
        const message = await prisma.message.create({
          data: {
            bookingId,
            body: body.trim(),
            type: "TEXT",
            senderId,
          },
          include: {
            sender: {
              select: {
                id: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        });

        // Broadcast to all users in the booking room
        io!.to(`booking:${bookingId}`).emit("new_message", message);
        
        // Send notification to the recipient (the other user in the booking)
        const recipientId = booking.customerId === senderId ? booking.providerId : booking.customerId;
        notifyMessageReceived(message, recipientId).catch((err) => {
          console.error('Failed to send message notification:', err);
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.userId}`);
    });
  });

  return io;
};