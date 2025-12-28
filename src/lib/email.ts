import nodemailer from "nodemailer";
import { env } from "../env";
import { prisma } from "./prisma";

// Create reusable transporter
let transporter: nodemailer.Transporter | null = null;

export function initializeEmailService() {
  if (!env.EMAIL_ENABLED || !env.EMAIL_HOST || !env.EMAIL_USER || !env.EMAIL_PASSWORD) {
    console.log("📧 Email service disabled (configuration missing)");
    return;
  }

  try {
    transporter = nodemailer.createTransport({
      host: env.EMAIL_HOST,
      port: env.EMAIL_PORT || 587,
      secure: env.EMAIL_SECURE, // true for 465, false for other ports
      auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASSWORD,
      },
    });

    console.log("📧 Email service initialized");
  } catch (error) {
    console.error("❌ Failed to initialize email service:", error);
    transporter = null;
  }
}

// Verify email configuration
export async function verifyEmailConfig(): Promise<boolean> {
  if (!transporter) {
    return false;
  }

  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.error("❌ Email configuration verification failed:", error);
    return false;
  }
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!transporter || !env.EMAIL_ENABLED) {
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM || env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ""), // Strip HTML for text version
    });

    return true;
  } catch (error) {
    console.error("❌ Failed to send email:", error);
    return false;
  }
}

// Email templates
export function getEmailTemplate(
  type: "booking_created" | "booking_accepted" | "booking_declined" | "booking_completed" | "booking_cancelled" | "message_received" | "rating_received",
  data: {
    userName: string;
    title: string;
    message: string;
    link?: string;
    bookingId?: string;
    serviceTitle?: string;
    providerName?: string;
    customerName?: string;
    rating?: number;
  }
): { subject: string; html: string } {
  const baseUrl = env.FRONTEND_URL;
  const fullLink = data.link ? `${baseUrl}${data.link}` : `${baseUrl}/dashboard`;

  const templates: Record<string, { subject: string; html: string }> = {
    booking_created: {
      subject: `New Booking Request: ${data.serviceTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Booking Request</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>You have received a new booking request for your service: <strong>${data.serviceTitle}</strong></p>
              <p><strong>Customer:</strong> ${data.customerName}</p>
              <p>${data.message}</p>
              <a href="${fullLink}" class="button">View Booking</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
    booking_accepted: {
      subject: `Booking Accepted: ${data.serviceTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Booking Accepted</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>Great news! Your booking request for <strong>${data.serviceTitle}</strong> has been accepted by ${data.providerName}.</p>
              <p>${data.message}</p>
              <a href="${fullLink}" class="button">View Booking Details</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
    booking_declined: {
      subject: `Booking Declined: ${data.serviceTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #EF4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Declined</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>Unfortunately, your booking request for <strong>${data.serviceTitle}</strong> has been declined by ${data.providerName}.</p>
              <p>${data.message}</p>
              <a href="${fullLink}" class="button">View Other Services</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
    booking_completed: {
      subject: `Booking Completed: ${data.serviceTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #10B981; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Booking Completed</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>Your booking for <strong>${data.serviceTitle}</strong> has been marked as completed.</p>
              <p>${data.message}</p>
              <p>We hope you had a great experience! Please consider leaving a review.</p>
              <a href="${fullLink}" class="button">Leave a Review</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
    booking_cancelled: {
      subject: `Booking Cancelled: ${data.serviceTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Cancelled</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>Your booking for <strong>${data.serviceTitle}</strong> has been cancelled.</p>
              <p>${data.message}</p>
              <a href="${fullLink}" class="button">View Bookings</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
    message_received: {
      subject: `New Message in Booking #${data.bookingId?.slice(0, 8)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>💬 New Message</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>You have received a new message in your booking conversation.</p>
              <p>${data.message}</p>
              <a href="${fullLink}" class="button">View Message</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
    rating_received: {
      subject: `New ${data.rating}-Star Rating Received`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F59E0B; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; padding: 12px 24px; background: #F59E0B; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⭐ New Rating</h1>
            </div>
            <div class="content">
              <p>Hello ${data.userName},</p>
              <p>You received a <strong>${data.rating}-star</strong> rating for your service: <strong>${data.serviceTitle}</strong></p>
              <p>${data.message}</p>
              <a href="${fullLink}" class="button">View Rating</a>
            </div>
            <div class="footer">
              <p>This is an automated email from HandyBangla. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    },
  };

  return templates[type] || {
    subject: data.title,
    html: `<p>${data.message}</p><a href="${fullLink}">View Details</a>`,
  };
}

// Helper to get user email
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return user?.email || null;
  } catch (error) {
    console.error("Failed to get user email:", error);
    return null;
  }
}

// Send email notification
export async function sendEmailNotification(
  userId: string,
  type: "booking_created" | "booking_accepted" | "booking_declined" | "booking_completed" | "booking_cancelled" | "message_received" | "rating_received",
  data: {
    title: string;
    message: string;
    link?: string;
    bookingId?: string;
    serviceTitle?: string;
    providerName?: string;
    customerName?: string;
    rating?: number;
  }
): Promise<void> {
  if (!env.EMAIL_ENABLED || !transporter) {
    return; // Silently fail if email is not configured
  }

  try {
    const userEmail = await getUserEmail(userId);
    if (!userEmail) {
      console.log(`No email found for user ${userId}`);
      return;
    }

    // Get user's full name for personalization
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true },
    });

    const template = getEmailTemplate(type, {
      userName: user?.fullName || "User",
      ...data,
    });

    const sent = await sendEmail({
      to: userEmail,
      subject: template.subject,
      html: template.html,
    });

    if (sent) {
      console.log(`📧 Email sent to ${userEmail} for ${type}`);
    }
  } catch (error) {
    console.error(`Failed to send email notification for ${type}:`, error);
    // Don't throw - email failures shouldn't break the app
  }
}