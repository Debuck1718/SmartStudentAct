// routes/index.js
import publicRoutes from "./publicRoutes.js";
import protectedRoutes from "./protectedRoutes.js";
import webhookRoutes from "./webhookRoutes.js";
import pushRoutes from "./pushRoutes.js";

export default (app, eventBus, agenda) => {
  const publicApiRouter = publicRoutes(eventBus, agenda);

  // ✅ These three are likely already express.Router() exports (not functions)
  app.use("/", publicApiRouter);
  app.use("/api", webhookRoutes);
  app.use("/api", protectedRoutes);
  app.use("/api", pushRoutes);
};

