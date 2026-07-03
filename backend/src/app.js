import path from "path";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

const app = express();

// --------------------
// Middleware
// --------------------
// Support a comma-separated list so a single env var can allow the
// production frontend, localhost dev, and Vercel preview URLs at once.
// Example:
//   CORS_ORIGIN=https://jobsy.vercel.app,http://localhost:5173
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin/no-origin requests (Postman, curl, server-to-server).
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Service-Key"],
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static("public/uploads"));

// --------------------
// Route imports
// --------------------
import userRouter from "./routes/user.route.js";
import userAuthRouter from "./routes/google_auth.route.js"
import emailRoutes from "./routes/email.route.js";
import internalGoogleRoutes from "./routes/internal_google.route.js";
import googleSyncRoutes from "./routes/google_sync.route.js";
import jobsRouter from "./routes/jobs.route.js";
import calendarRouter from "./routes/calendar.route.js";
import profileRoutes from "./routes/profile.route.js";
import aiRoutes from "./routes/ai.route.js"
import notificationsRouter from "./routes/notifications.route.js"
import resumeRouter from "./routes/resume.route.js";
import { sseService } from "./services/sse.service.js";
import { verifyJWT } from "./middleware/auth.middleware.js";

app.use("/api/user", userRouter);
app.use("/api/profile", profileRoutes);
app.use("/api/calendar", calendarRouter);

app.use("/api/auth", userAuthRouter);

app.use("/api/jobs", jobsRouter);

app.use("/api/emails", emailRoutes);




app.use("/internal/google", internalGoogleRoutes);

app.use("/sync/google",googleSyncRoutes)

app.use("/api/ai",aiRoutes)
app.use("/api/notifications", notificationsRouter)


app.use("/api/resume", resumeRouter);

app.get("/api/sse", verifyJWT, (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const userId = String(req.user._id);
  sseService.addClient(userId, res);
  req.on("close", () => sseService.removeClient(userId));
});


app.get("/", (req, res) => {
  res.send("Hey Ladies");
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});


app.use((err, req, res, next) => {
  console.error("=== GLOBAL ERROR HANDLER ===");
  console.error(err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

export { app };
