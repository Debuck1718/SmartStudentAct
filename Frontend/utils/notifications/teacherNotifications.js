const { eventBus, notifyUser, emailTemplates } = require("../eventBus");
const User = require("../../api/models/User");


eventBus.on("feedback_given", async ({ assignmentId, studentId, feedback }) => {
  const teacher = await User.findById(assignmentId.teacher_id);
  if (!teacher) return;
  await notifyUser(
    teacher,
    "Feedback Received",
    `Feedback from student ${studentId}: ${feedback}`,
    "/teacher/assignments",
    emailTemplates.feedbackReceived
  );
});

eventBus.on("assignment_graded", async ({ assignmentId, studentId, grade }) => {
  const teacher = await User.findById(assignmentId.teacher_id);
  if (!teacher) return;
  await notifyUser(
    teacher,
    "Assignment Graded",
    `Student ${studentId} received grade: ${grade}`,
    "/teacher/assignments",
    emailTemplates.gradedAssignment
  );
});
