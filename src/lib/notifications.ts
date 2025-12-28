import { prisma } from "./prisma";
import { io } from "./socket";
import { NotificationType } from "@prisma/client";
import { sendEmailNotification } from "./email";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  bookingId?: string;
  messageId?: string;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    // Build data object, only including defined optional fields
    const data: {
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      link?: string;
      bookingId?: string;
      messageId?: string;
    } = {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
    };

    // Only add optional fields if they are defined
    if (params.link !== undefined) {
      data.link = params.link;
    }
    if (params.bookingId !== undefined) {
      data.bookingId = params.bookingId;
    }
    if (params.messageId !== undefined) {
      data.messageId = params.messageId;
    }

    const notification = await prisma.notification.create({
      data,
    });

    // Emit real-time notification via Socket.io
    if (io) {
      io.to(`user_${params.userId}`).emit("new_notification", notification);
    }

    return notification;
  } catch (error) {
    console.error("Failed to create notification:", error);
    throw error;
  }
}

// Helper functions for common notification types
export async function notifyBookingCreated(booking: any) {
  const notification = await createNotification({
    userId: booking.providerId,
    type: NotificationType.BOOKING_CREATED,
    title: "New Booking Request",
    message: `${booking.customer.fullName} requested your service: ${booking.service.title}`,
    link: `/bookings`,
    bookingId: booking.id,
  });

  // Send email notification
  sendEmailNotification(booking.providerId, "booking_created", {
    title: "New Booking Request",
    message: `${booking.customer.fullName} requested your service: ${booking.service.title}`,
    link: `/bookings`,
    bookingId: booking.id,
    serviceTitle: booking.service.title,
    customerName: booking.customer.fullName,
  }).catch((err) => {
    console.error("Failed to send email notification:", err);
  });

  return notification;
}

export async function notifyBookingStatusChange(booking: any, status: string) {
  try {
    const statusMessages: Record<string, { title: string; message: string; emailType: "booking_accepted" | "booking_declined" | "booking_completed" | "booking_cancelled" }> = {
      ACCEPTED: {
        title: "Booking Accepted",
        message: `${booking.provider?.fullName || 'Provider'} accepted your booking request for ${booking.service?.title || 'service'}`,
        emailType: "booking_accepted",
      },
      DECLINED: {
        title: "Booking Declined",
        message: `${booking.provider?.fullName || 'Provider'} declined your booking request for ${booking.service?.title || 'service'}`,
        emailType: "booking_declined",
      },
      COMPLETED: {
        title: "Booking Completed",
        message: `Your booking for ${booking.service?.title || 'service'} has been marked as completed`,
        emailType: "booking_completed",
      },
      CANCELLED: {
        title: "Booking Cancelled",
        message: `Your booking for ${booking.service?.title || 'service'} has been cancelled`,
        emailType: "booking_cancelled",
      },
    };

    const statusInfo = statusMessages[status];
    if (!statusInfo) {
      console.log('No notification message for status:', status);
      return;
    }

    const notificationType = `BOOKING_${status}` as NotificationType;

    const notification = await createNotification({
      userId: booking.customerId,
      type: notificationType,
      title: statusInfo.title,
      message: statusInfo.message,
      link: `/bookings`,
      bookingId: booking.id,
    });

    // Send email notification
    sendEmailNotification(booking.customerId, statusInfo.emailType, {
      title: statusInfo.title,
      message: statusInfo.message,
      link: `/bookings`,
      bookingId: booking.id,
      serviceTitle: booking.service?.title,
      providerName: booking.provider?.fullName,
    }).catch((err) => {
      console.error("Failed to send email notification:", err);
    });

    console.log('Booking status notification sent:', { userId: booking.customerId, status });
  } catch (error) {
    console.error('Error in notifyBookingStatusChange:', error);
    throw error;
  }
}

export async function notifyMessageReceived(message: any, recipientId: string) {
  const notification = await createNotification({
    userId: recipientId,
    type: NotificationType.MESSAGE_RECEIVED,
    title: "New Message",
    message: `You have a new message in booking #${message.bookingId.slice(0, 8)}`,
    link: `/bookings`,
    bookingId: message.bookingId,
    messageId: message.id,
  });

  // Send email notification
  sendEmailNotification(recipientId, "message_received", {
    title: "New Message",
    message: `You have a new message in booking #${message.bookingId.slice(0, 8)}`,
    link: `/bookings`,
    bookingId: message.bookingId,
  }).catch((err) => {
    console.error("Failed to send email notification:", err);
  });

  return notification;
}

export async function notifyRatingReceived(rating: any, providerId: string) {
  const notification = await createNotification({
    userId: providerId,
    type: NotificationType.RATING_RECEIVED,
    title: "New Rating",
    message: `You received a ${rating.rating}-star rating for ${rating.service.title}`,
    link: `/services/${rating.serviceId}`,
    bookingId: rating.bookingId,
  });

  // Send email notification
  sendEmailNotification(providerId, "rating_received", {
    title: "New Rating",
    message: `You received a ${rating.rating}-star rating for ${rating.service.title}`,
    link: `/services/${rating.serviceId}`,
    bookingId: rating.bookingId,
    serviceTitle: rating.service.title,
    rating: rating.rating,
  }).catch((err) => {
    console.error("Failed to send email notification:", err);
  });

  return notification;
}