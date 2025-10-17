import listHandler from "./list.js";
import removeHandler from "./remove.js";
import requestHandler from "./request.js";
import respondHandler from "./respond.js";

export default async function handler(req, res) {
  const { url } = req;

  if (url.endsWith("/list")) return listHandler(req, res);
  if (url.endsWith("/remove")) return removeHandler(req, res);
  if (url.endsWith("/request")) return requestHandler(req, res);
  if (url.endsWith("/respond")) return respondHandler(req, res);

  return res.status(404).json({ error: "Special links endpoint not found" });
}
