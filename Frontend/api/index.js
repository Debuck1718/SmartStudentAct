// /api/index.js
import express from "express";
import cors from "cors";
import { connectDb } from "./lib/db.js";

// Middleware imports (for use in subroutes if needed)
import { authenticateJWT } from "./middlewares/auth.js";
import { hasRole } from "./middlewares/roles.js";

// ---- Route group imports ----
import userRoutes from "./users/index.js";
import teacherRoutes from "./teacher/index.js";
import studentRoutes from "./student/index.js";
import workerRoutes from "./worker/index.js";
import profileRoutes from "./profile/index.js";
import settingsRoutes from "./settings/index.js";
import specialLinksRoutes from "./special-links/index.js";
import adminRoutes from "./admin/index.js";
import overseerRoutes from "./overseer/index.js";
import globalOverseerRoutes from "./global-overseer/index.js";
import servicesRoutes from "./services/index.js";

// Single-file endpoints (still routers)
import leaderboard from "./leaderboard.js";
import payment from "./payment.js";
import school from "./school.js";
import webhook from "./webhook.js";
import cronRoutes from "./cron/index.js";

const app = express();

// --- Global middleware ---
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Connect to MongoDB ---
await connectDb();

// --- Mount route groups ---
app.use("/users", userRoutes);
app.use("/teacher", teacherRoutes);
app.use("/student", studentRoutes);
app.use("/worker", workerRoutes);
app.use("/profile", profileRoutes);
app.use("/settings", settingsRoutes);
app.use("/special-links", specialLinksRoutes);
app.use("/admin", adminRoutes);
app.use("/overseer", overseerRoutes);
app.use("/global-overseer", globalOverseerRoutes);
app.use("/services", servicesRoutes);

// --- Single endpoints ---
app.use("/leaderboard", leaderboard);
app.use("/payment", payment);
app.use("/school", school);
app.use("/webhook", webhook);
app.use("/cron", cronRoutes);

// --- Default health check route ---
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "SmartStudentAct API running on Vercel 🚀",
  });
});

export default app;
