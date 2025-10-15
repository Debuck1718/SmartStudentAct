// /api/utils/withMiddleware.js
export function withMiddleware(handler, middlewares = []) {
  return async (req, res) => {
    try {
      for (let mw of middlewares) {
        let called = false;
        await new Promise((resolve, reject) => {
          mw(req, res, (err) => {
            called = true;
            if (err) reject(err);
            else resolve();
          });
        });
        if (!called) return; // middleware ended response
      }
      return handler(req, res);
    } catch (err) {
      console.error("Middleware error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  };
}
