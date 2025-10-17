import fs from "fs";
import path from "path";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const { filename } = req.query;

  try {
    const filePath = path.join(process.cwd(), "uploads", "submissions", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found." });
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": stat.size,
      "Content-Disposition": `attachment; filename="${filename}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: "Error downloading file", error: error.message });
  }
}
