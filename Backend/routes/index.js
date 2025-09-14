// routes/index.js
const publicRoutes = require("./publicRoutes");
const protectedRoutes = require("./protectedRoutes");
const webhookRoutes = require("./webhookRoutes");
const pushRoutes = require("./pushRoutes"); 

module.exports = (app, eventBus, agenda) => {
  const publicApiRouter = publicRoutes(eventBus, agenda);
  const protectedApiRouter = protectedRoutes;

  app.use("/api", publicApiRouter);

  app.use("/api", webhookRoutes);

  app.use("/api", protectedApiRouter);

  app.use("/api", pushRoutes);
};

