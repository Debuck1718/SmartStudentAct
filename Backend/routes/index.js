/* routes/index.js - Central router loader */
const publicRouter = require('./publicRoutes');
const protectedRouter = require('./protectedRoutes');

// This function acts as a factory that receives dependencies and returns the routers.
module.exports = (app, eventBus, agenda) => {
    // We need to call the imported router files as functions to get the router instances.
    const publicApiRouter = publicRouter(eventBus, agenda);
    const protectedApiRouter = protectedRouter(eventBus, agenda); 

    // Mount public routes first (no authentication required).
    app.use("/api", publicApiRouter);
    
    // Mount protected routes second (requires authentication).
    app.use("/api", protectedApiRouter);
};