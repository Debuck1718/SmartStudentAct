import express from "express";
import { addSchool } from "../controllers/schoolController.js";

const router = express.Router();

router.post("/", addSchool);

export default router;

