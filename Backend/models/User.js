protectedRouter.post(
  "/teacher/assignments",
  authenticateJWT,
  hasRole("teacher"),
  localUpload.single("file"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        due_date,
        assigned_to_users,
        assigned_to_grades,
        assigned_to_levels,     
        assigned_to_programs,   
        assigned_to_schools,
        assignToMyGrade,
        assignToMyLevel,
        assignToSchool,
        assignToMyProgram,
      } = req.body;

      const teacherId = req.user.id;

      if (!title || !due_date) {
        return res.status(400).json({
          message: "Missing required fields: title or dueDate.",
        });
      }

      const teacher = await User.findById(teacherId);
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found." });
      }

      let targetUsers = [];
      let targetGrades = [];
      let targetLevels = [];
      let targetPrograms = [];
      let targetSchools = [];

      if (Array.isArray(assigned_to_users) && assigned_to_users.length > 0) {
        targetUsers.push(...assigned_to_users);
      }

      if (Array.isArray(assigned_to_grades) && assigned_to_grades.length > 0) {
        targetGrades.push(...assigned_to_grades);
      }

      if (Array.isArray(assigned_to_levels) && assigned_to_levels.length > 0) {
        targetLevels.push(...assigned_to_levels);
      }

      if (Array.isArray(assigned_to_programs) && assigned_to_programs.length > 0) {
        targetPrograms.push(...assigned_to_programs);
      }

      if (Array.isArray(assigned_to_schools) && assigned_to_schools.length > 0) {
        targetSchools.push(...assigned_to_schools);
      }

      if (assignToMyGrade && teacher.grade) {
        targetGrades.push(teacher.grade);
      }

      if (assignToMyLevel && Array.isArray(teacher.teacherGrade) && teacher.teacherGrade.length > 0) {
        targetLevels.push(...teacher.teacherGrade);
      }

      if (assignToMyProgram && teacher.teacherSubject) {
        targetPrograms.push(teacher.teacherSubject);
      }

      if (assignToSchool && teacher.schoolName) {
        targetSchools.push(teacher.schoolName);
      }

      targetUsers = [...new Set(targetUsers)];
      targetGrades = [...new Set(targetGrades)];
      targetLevels = [...new Set(targetLevels)];
      targetPrograms = [...new Set(targetPrograms)];
      targetSchools = [...new Set(targetSchools)];

      const newAssignment = new Assignment({
        title,
        description,
        due_date: new Date(due_date),
        teacher_id: teacherId,
        assigned_to_users: targetUsers,
        assigned_to_grades: targetGrades,
        assigned_to_levels: targetLevels,      
        assigned_to_programs: targetPrograms,  
        assigned_to_schools: targetSchools,
        file_path: req.file ? `/uploads/assignments/${req.file.filename}` : null,
      });

      await newAssignment.save();

      eventBus.emit("assignment_created", {
        assignmentId: newAssignment._id,
        title: newAssignment.title,
        creatorId: teacherId,
      });

      res.status(201).json({
        message: "Assignment created successfully!",
        assignment: newAssignment,
      });
    } catch (error) {
      logger.error("Error creating assignment:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

