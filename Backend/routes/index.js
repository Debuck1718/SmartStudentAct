/* routes/index.js - Central router loader */
const publicRoutes = require('./publicRoutes');
const protectedRoutes = require('./protectedRoutes');

// This function acts as a factory that receives dependencies and returns the routers.
module.exports = (app, eventBus, agenda) => {
    // Call the publicRoutes function to get the router instance
    const publicApiRouter = publicRoutes(eventBus, agenda);
    
    // protectedRoutes.js directly exports a router instance, not a function, so we don't call it.
    // We can simply assign it to a variable.
    const protectedApiRouter = protectedRoutes; 

    // Mount public routes first (no authentication required).
    app.use("/api", publicApiRouter);
    
    // Mount protected routes second (requires authentication).
    app.use("/api", protectedApiRouter);
};
