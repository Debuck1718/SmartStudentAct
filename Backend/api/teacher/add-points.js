// api/teacher/add-points.js
import dbConnect from "@/lib/db";
import User from "@/models/User";
import StudentRewards from "@/models/StudentRewards";
import Reward from "@/models/Reward";
import { authenticateJWT } from "@/middlewares/auth";
import logger from "@/utils/logger";
import Joi from "joi";

const addPointsSchema = Joi.object({
  points: Joi.number().integer().required(),
  reason: Joi.string().required(),
  studentIds: Joi.array().items(Joi.string().alphanum().length(24)).optional(),
  grade: Joi.string().optional(),
  program: Joi.string().optional(),
  otherGrade: Joi.string().optional(),
}).oxor("studentIds", "grade", "program", "otherGrade");

async function grantReward({ userIds, type, points, description, source, grantedBy }) {
  for (const userId of userIds) {
    const parsedPoints = parseInt(points, 10);
    if (isNaN(parsedPoints)) continue;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { smart_points: parsedPoints } },
      { new: true }
    );

    if (!updatedUser) continue;

    let studentRewards = await StudentRewards.findOne({ studentId: userId });
    if (!studentRewards) {
      studentRewards = new StudentRewards({ studentId: userId, pointsLog: [] });
    }

    studentRewards.pointsLog.push({
      points: parsedPoints,
      source,
      description,
      date: new Date(),
    });
    await studentRewards.save();

    const reward = new Reward({
      user_id: userId,
      type,
      points: parsedPoints,
      description,
      granted_by: grantedBy,
    });
    await reward.save();
  }

  logger.info(`Granted ${points} points to ${userIds.length} students.`);
}

export default async function handler(req, res) {
  await dbConnect();
  await authenticateJWT(req, res);

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { error, value } = addPointsSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { points, reason, studentIds, grade, program, otherGrade } = value;
    let studentsToUpdate = [];

    if (studentIds) {
      const students = await User.find({ _id: { $in: studentIds } });
      studentsToUpdate = students.map((s) => s._id);
    } else if (grade) {
      const students = await User.find({ grade, role: "student" });
      studentsToUpdate = students.map((s) => s._id);
    } else if (program) {
      const students = await User.find({ program, role: "student" });
      studentsToUpdate = students.map((s) => s._id);
    } else if (otherGrade) {
      const students = await User.find({ grade: otherGrade, role: "student" });
      studentsToUpdate = students.map((s) => s._id);
    }

    if (studentsToUpdate.length === 0) {
      return res.status(404).json({ message: "No students found for the given criteria." });
    }

    await grantReward({
      userIds: studentsToUpdate,
      type: "teacher_grant",
      points,
      description: reason,
      source: "Teacher",
      grantedBy: req.userId,
    });

    return res.status(200).json({
      message: `Successfully added ${points} points to ${studentsToUpdate.length} students.`,
    });
  } catch (error) {
    logger.error("Error adding points:", error);
    return res.status(500).json({ message: "Server error while adding points." });
  }
}
