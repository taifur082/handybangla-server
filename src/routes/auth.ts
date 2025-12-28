import { Router } from "express";
import { supabase } from "../lib/supabase";
import { prisma } from "../lib/prisma";
import type { ApiError } from "../middleware/errorHandler";

export const authRouter = Router();

// Register new user (creates Supabase auth user + database record)
authRouter.post("/register", async (req, res, next) => {
  try {
    const { email, password, fullName, phone, role = "CUSTOMER" } = req.body;

    console.log('Registration request:', { email, fullName, role });

    if (!email || !password || !fullName) {
      const error: ApiError = new Error("Email, password, and fullName are required");
      error.status = 400;
      return next(error);
    }

    // Step 1: Check if user already exists in database
    const existingDbUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingDbUser) {
      console.log('User already exists in database');
      const error: ApiError = new Error("This email is already registered. Please log in instead.");
      error.status = 409; // Conflict
      return next(error);
    }

    // Step 2: Try to create user in Supabase Auth
    console.log('Creating user in Supabase Auth...');
    let authData: any;
    let authError: any;
    
    const createResult = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    authData = createResult.data;
    authError = createResult.error;

    // Step 3: Handle case where user exists in Supabase but not in database
    if (authError?.code === 'email_exists' || authError?.status === 422) {
      console.log('User exists in Supabase Auth, checking if database record exists...');
      
      // Try to find the user by email in Supabase
      const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
      
      if (listError) {
        console.error('Failed to list users:', listError);
        const error: ApiError = new Error("Could not verify user status. Please try again or contact support.");
        error.status = 500;
        return next(error);
      }

      const existingAuthUser = usersData.users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
      
      if (existingAuthUser) {
        console.log('Found existing Supabase user:', existingAuthUser.id);
        
        // Check if this user has a database record
        const dbUser = await prisma.user.findUnique({
          where: { id: existingAuthUser.id },
        });

        if (dbUser) {
          // User exists in both - they should log in
          const error: ApiError = new Error("This email is already registered. Please log in instead.");
          error.status = 409;
          return next(error);
        }

        // User exists in Supabase but not in database - create database record
        console.log('Creating database record for existing Supabase user...');
        try {
          const user = await prisma.user.create({
            data: {
              id: existingAuthUser.id,
              email,
              fullName,
              phone: phone || null,
              role: role as "CUSTOMER" | "PROVIDER" | "ADMIN",
            },
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
              createdAt: true,
            },
          });

          console.log('Database record created for existing Supabase user:', user.id);
          res.status(201).json({ 
            user,
            message: "Account created successfully. You can now log in."
          });
          return;
        } catch (dbError: any) {
          console.error('Failed to create database record:', dbError);
          
          // If it's a unique constraint error, user might have been created by another request
          if (dbError.code === 'P2002') {
            const existingUser = await prisma.user.findUnique({
              where: { id: existingAuthUser.id },
              select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                createdAt: true,
              },
            });
            
            if (existingUser) {
              res.status(200).json({ 
                user: existingUser,
                message: "Account already exists. Please log in."
              });
              return;
            }
          }
          
          throw dbError;
        }
      } else {
        // Email exists error but user not found - might be a race condition
        const error: ApiError = new Error("Registration failed. Please try again in a moment.");
        error.status = 500;
        return next(error);
      }
    }

    // Step 4: Handle other Supabase errors
    if (authError || !authData.user) {
      console.error('Supabase auth error:', authError);
      const error: ApiError = new Error(authError?.message ?? "Failed to create user account");
      error.status = 400;
      return next(error);
    }

    // Step 5: Create database record for new user
    console.log('Creating database record for new user...');
    try {
      const user = await prisma.user.create({
        data: {
          id: authData.user.id,
          email,
          fullName,
          phone: phone || null,
          role: role as "CUSTOMER" | "PROVIDER" | "ADMIN",
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      console.log('User created successfully:', user.id);
      res.status(201).json({ user });
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      
      // Cleanup: Delete Supabase user if database creation fails
      try {
        await supabase.auth.admin.deleteUser(authData.user.id);
        console.log('Cleaned up Supabase user after DB error');
      } catch (cleanupError) {
        console.error('Failed to cleanup Supabase user:', cleanupError);
      }
      
      // Handle unique constraint (race condition)
      if (dbError.code === 'P2002') {
        const existingUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            createdAt: true,
          },
        });
        
        if (existingUser) {
          res.status(200).json({ 
            user: existingUser,
            message: "Account already exists. Please log in."
          });
          return;
        }
      }
      
      throw dbError;
    }
  } catch (error) {
    console.error('Registration error:', error);
    next(error);
  }
});

// Get current user profile
authRouter.get("/me", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      const error: ApiError = new Error("Missing authorization");
      error.status = 401;
      return next(error);
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      const error: ApiError = new Error("Invalid token");
      error.status = 401;
      return next(error);
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
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
        createdAt: true,
      },
    });

    if (!dbUser) {
      const error: ApiError = new Error("User not found");
      error.status = 404;
      return next(error);
    }

    res.json({ user: dbUser });
  } catch (error) {
    next(error);
  }
});