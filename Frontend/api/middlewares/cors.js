// middlewares/cors.js
export function runCors(req, res) {
  return new Promise((resolve) => {
    // Allowed origins
    const allowedOrigins = [
      "https://www.smartstudentact.com",
      "https://smart-student-57b2svy6h-debucks-projects.vercel.app",
      "http://localhost:3000",
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle preflight OPTIONS
    if (req.method === "OPTIONS") {
      res.status(200).end();
      return resolve();
    }

    resolve();
  });
}
