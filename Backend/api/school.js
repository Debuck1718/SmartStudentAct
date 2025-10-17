import { addSchool } from "./controllers/schoolController.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    return addSchool(req, res);
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
}
