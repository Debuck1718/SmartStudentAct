// routes/index.js
import publicRoutes from "./publicRoutes.js";
import protectedRoutes from "./protectedRoutes.js";
import webhookRoutes from "./webhookRoutes.js";
import pushRoutes from "./pushRoutes.js";

export default (app, eventBus, agenda) => {
  const publicApiRouter = publicRoutes(eventBus, agenda);
  const protectedApiRouter = protectedRoutes;

  app.use("/api", publicApiRouter);
  app.use("/api", webhookRoutes);
  app.use("/api", protectedApiRouter);
  app.use("/api", pushRoutes);
};
