const publicRouter = require('./publicRoutes');
const protectedRouter = require('./protectedRoutes');

module.exports = (app, eventBus, agenda) => {
    const publicApiRouter = publicRouter(eventBus, agenda);
    const protectedApiRouter = protectedRouter(eventBus, agenda);

    app.use("/api", publicApiRouter);
    app.use("/api", protectedApiRouter);
};
