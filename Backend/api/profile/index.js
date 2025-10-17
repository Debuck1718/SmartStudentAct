import getHandler from "./get.js";
import updateHandler from "./update.js";
import getPhotoHandler from "./get-photo.js";
import uploadPhotoHandler from "./upload-photo.js";

export default async function handler(req, res) {
  const { method, url } = req;

  if (url.endsWith("/get-photo")) return getPhotoHandler(req, res);
  if (url.endsWith("/upload-photo")) return uploadPhotoHandler(req, res);
  if (method === "GET") return getHandler(req, res);
  if (method === "PUT" || method === "PATCH") return updateHandler(req, res);

  return res.status(404).json({ error: "Profile endpoint not found" });
}
