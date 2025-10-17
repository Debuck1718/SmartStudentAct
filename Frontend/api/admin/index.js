import addSchoolHandler from "./school/add.js";
import assignRegionHandler from "./assign-region.js";
import promoteHandler from "./promote.js";
import removeUserHandler from "./remove-user.js";
import schoolsHandler from "./schools.js";

export default async function handler(req, res) {
  const { url } = req;

  if (url.endsWith("/school/add")) return addSchoolHandler(req, res);
  if (url.endsWith("/assign-region")) return assignRegionHandler(req, res);
  if (url.endsWith("/promote")) return promoteHandler(req, res);
  if (url.endsWith("/remove-user")) return removeUserHandler(req, res);
  if (url.endsWith("/schools")) return schoolsHandler(req, res);

  return res.status(404).json({ error: "Admin endpoint not found" });
}
