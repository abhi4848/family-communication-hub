import "dotenv/config";
import express, { type Request, type Response, type NextFunction } from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { PrismaClient, MessageType, Role, AuditAction } from "@prisma/client";
import argon2 from "argon2";
import { z } from "zod";
import webpush from "web-push";
import { requireAuth, setAuthCookie, signToken, userFrom } from "./auth";

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  process.env.WEB_ORIGIN,
  ...(process.env.NODE_ENV !== "production" ? [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://192.168.0.115:3000",
    "http://192.168.0.115:3001"
  ] : [])
].filter(Boolean) as string[];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS origin denied: ${origin}`));
    }
  },
  credentials: true
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Ensure uploads directory exists and serve it
const uploadDir = path.join(process.cwd(), "apps", "api", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2,9)}${path.extname(file.originalname) || ".webm"}`;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false
});

const io = new Server(server, {
  cors: corsOptions
});

io.use((socket, next) => {
  // Socket authentication is intentionally done through the same JWT cookie.
  try {
    const cookie = socket.handshake.headers.cookie || "";
    const token = cookie.split(";").map(x => x.trim()).find(x => x.startsWith("familyhub_access="))?.split("=")[1];
    if (!token) return next(new Error("Unauthorized"));
    const jwt = require("jsonwebtoken");
    const payload = jwt.verify(token, process.env.JWT_SECRET!, { issuer: "familyhub" }) as any;
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", socket => {
  const user = socket.data.user;
  socket.join(`family:${user.familyId}`);
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128)
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await argon2.verify(user.passwordHash, parsed.data.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const authUser = { id: user.id, familyId: user.familyId, role: user.role, name: user.name, email: user.email };
  setAuthCookie(res, signToken(authUser));

  await prisma.auditLog.create({
    data: { familyId: user.familyId, userId: user.id, action: AuditAction.LOGIN }
  });

  res.json({ user: authUser });
});

app.post("/auth/logout", requireAuth, async (req, res) => {
  const user = userFrom(req);
  await prisma.auditLog.create({ data: { familyId: user.familyId, userId: user.id, action: AuditAction.LOGOUT } });
  res.clearCookie("familyhub_access", { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" });
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, async (req, res) => {
  res.json({ user: userFrom(req) });
});

app.get("/messages", requireAuth, async (req, res) => {
  const user = userFrom(req);
  const messages = await prisma.message.findMany({
    where: { familyId: user.familyId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sender: { select: { id: true, name: true, role: true } } }
  });
  res.json({ messages });
});

app.post("/messages", requireAuth, async (req, res) => {
  const user = userFrom(req);
  const parsed = z.object({
    type: z.enum(["TEXT", "VOICE", "QUICK_ACTION", "AI"]),
    body: z.string().max(5000).optional(),
    mediaUrl: z.string().url().max(2000).optional(),
    quickAction: z.string().max(100).optional()
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Invalid message" });

  if (parsed.data.type === "TEXT" && !parsed.data.body?.trim()) {
    return res.status(400).json({ error: "Message cannot be empty" });
  }

  const message = await prisma.message.create({
    data: {
      familyId: user.familyId,
      senderId: user.id,
      type: parsed.data.type as MessageType,
      body: parsed.data.body?.trim(),
      mediaUrl: parsed.data.mediaUrl,
      quickAction: parsed.data.quickAction
    },
    include: { sender: { select: { id: true, name: true, role: true } } }
  });

  await prisma.auditLog.create({
    data: {
      familyId: user.familyId,
      userId: user.id,
      action: parsed.data.type === "VOICE" ? AuditAction.VOICE_SENT :
        parsed.data.type === "QUICK_ACTION" ? AuditAction.QUICK_ACTION : AuditAction.MESSAGE_SENT,
      metadata: { messageId: message.id, type: parsed.data.type }
    }
  });

  io.to(`family:${user.familyId}`).emit("message:new", message);
  res.status(201).json({ message });
});

// Upload endpoint for voice (and other media) files
app.post("/uploads", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  const reqWithFile = req as Request & { file?: Express.Multer.File };
  if (!reqWithFile.file) return res.status(400).json({ error: "No file uploaded" });

  const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${reqWithFile.file.filename}`;
  res.status(201).json({ url: fileUrl });
});

app.post("/messages/:id/read", requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const user = userFrom(req);
  const message = await prisma.message.findFirst({ where: { id: req.params.id, familyId: user.familyId } });
  if (!message) return res.status(404).json({ error: "Message not found" });

  await prisma.messageRead.upsert({
    where: { messageId_userId: { messageId: message.id, userId: user.id } },
    update: { readAt: new Date() },
    create: { messageId: message.id, userId: user.id }
  });

  await prisma.auditLog.create({
    data: { familyId: user.familyId, userId: user.id, action: AuditAction.MESSAGE_READ, metadata: { messageId: message.id } }
  });

  io.to(`family:${user.familyId}`).emit("message:read", { messageId: message.id, userId: user.id });
  res.json({ ok: true });
});

app.get("/notifications", requireAuth, async (req, res) => {
  const user = userFrom(req);

  const notifications = await prisma.message.findMany({
    where: {
      familyId: user.familyId,
      senderId: { not: user.id },
      reads: {
        none: {
          userId: user.id
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 30,
    include: {
      sender: {
        select: {
          id: true,
          name: true,
          role: true
        }
      }
    }
  });

  res.json({
    unreadCount: notifications.length,
    notifications
  });
});

app.post("/push/subscribe", requireAuth, async (req, res) => {
  const user = userFrom(req);
  const parsed = z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() })
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Invalid subscription" });

  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: { userId: user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
    create: { userId: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }
  });

  await prisma.auditLog.create({
    data: { familyId: user.familyId, userId: user.id, action: AuditAction.PUSH_SUBSCRIBED }
  });

  res.json({ ok: true });
});

app.get("/family/members", requireAuth, async (req, res) => {
  const user = userFrom(req);
  const members = await prisma.user.findMany({
    where: { familyId: user.familyId },
    select: { id: true, name: true, role: true }
  });
  res.json({ members });
});

app.get("/audit", requireAuth, async (req, res) => {
  const user = userFrom(req);
  if (user.role !== Role.PARENT) return res.status(403).json({ error: "Parents only" });

  const logs = await prisma.auditLog.findMany({
    where: { familyId: user.familyId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { name: true, role: true } } }
  });
  res.json({ logs });
});

app.post("/ai/ask", requireAuth, async (req, res) => {
  const user = userFrom(req);
  if (user.role !== Role.KID) return res.status(403).json({ error: "Kid portal only" });

  const parsed = z.object({
    question: z.string().min(1).max(1000),
    forwardToFamily: z.boolean().default(false)
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ error: "Invalid question" });

  await prisma.auditLog.create({
    data: {
      familyId: user.familyId,
      userId: user.id,
      action: parsed.data.forwardToFamily ? AuditAction.AI_FORWARDED : AuditAction.AI_QUESTION,
      metadata: { question: parsed.data.question }
    }
  });

  if (parsed.data.forwardToFamily) {
    const message = await prisma.message.create({
      data: {
        familyId: user.familyId,
        senderId: user.id,
        type: MessageType.AI,
        body: `Question for family: ${parsed.data.question}`
      },
      include: { sender: { select: { id: true, name: true, role: true } } }
    });
    io.to(`family:${user.familyId}`).emit("message:new", message);
    return res.json({ answer: "I sent that question to your family." });
  }

  // Safe local fallback. Configure AI_API_URL for a real model integration.
  if (process.env.AI_ENABLED !== "true") {
    return res.json({
      answer: "I can help with simple questions. If you need a family member to decide something, use “Ask my family”."
    });
  }

  try {
    const response = await fetch(process.env.AI_API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AI_API_KEY || ""}`
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL,
        messages: [
          {
            role: "system",
            content: "You are a child-safe family assistant. Give concise, age-appropriate answers. Never claim to be a parent. For emergencies, tell the child to use the Emergency button and contact a trusted adult."
          },
          { role: "user", content: parsed.data.question }
        ]
      })
    });

    if (!response.ok) throw new Error("AI provider error");
    const data: any = await response.json();
    const answer = data.choices?.[0]?.message?.content || "I couldn't answer that right now.";
    res.json({ answer });
  } catch {
    res.status(502).json({ error: "AI service unavailable" });
  }
});

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const PORT = Number(process.env.PORT || 4000);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`API running on port ${PORT}`);
});
