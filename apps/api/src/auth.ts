import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error("JWT_SECRET is required");

export type AuthUser = { id: string; familyId: string; role: Role; name: string; email: string };

export function signToken(user: AuthUser) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "15m", issuer: "familyhub" });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie("familyhub_access", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax",
    maxAge: 15 * 60 * 1000,
    path: "/"
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.familyhub_access;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const payload = jwt.verify(token, JWT_SECRET, { issuer: "familyhub" }) as AuthUser;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });

    if (!user) return res.status(401).json({ error: "User not found" });

    (req as any).user = {
      id: user.id,
      familyId: user.familyId,
      role: user.role,
      name: user.name,
      email: user.email
    } satisfies AuthUser;

    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

export function userFrom(req: Request): AuthUser {
  return (req as any).user;
}
