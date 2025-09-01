// routes/index.js
const publicRoutes = require("./publicRoutes");
const protectedRoutes = require("./protectedRoutes");
const webhookRoutes = require("./webhookRoutes"); 

module.exports = (app, eventBus, agenda) => {
  const publicApiRouter = publicRoutes(eventBus, agenda);
  const protectedApiRouter = protectedRoutes;

  app.use("/api", publicApiRouter);

  app.use("/api", webhookRoutes); 

 
  app.use("/api", protectedApiRouter);
};
