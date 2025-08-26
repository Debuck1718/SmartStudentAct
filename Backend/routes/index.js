/* routes/index.js - Central router loader */
const publicRoutes = require('./publicRoutes');
const protectedRoutes = require('./protectedRoutes');

module.exports = (app, eventBus, agenda) => {
    const publicApiRouter = publicRoutes(eventBus, agenda);
    const protectedApiRouter = protectedRoutes; 

    app.use("/api", publicApiRouter);
    

    app.use("/api", protectedApiRouter);
};
