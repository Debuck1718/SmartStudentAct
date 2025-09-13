const express = require('express');
const router = express.Router();
const Joi = require('joi');
const logger = require('../utils/logger');
const eventBus = require('../utils/eventBus');

const StudentRewards = require('../models/StudentRewards');
const User = require('../models/User');
const Reward = require('../models/Reward');
const BudgetEntry = require('../models/BudgetEntry');
const { authenticateJWT, requireAdmin } = require('../middlewares/auth');
const checkSubscription = require('../middlewares/checkSubscription');

const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";

function hasRole(allowedRoles = []) {
  return (req, res, next) => {
    try {
      const userRole = req.user?.role;
      if (!userRole) {
        return res.status(403).json({ message: "No role assigned. Forbidden." });
      }
      if (allowedRoles.includes(userRole)) {
        return next();
      }
      return res.status(403).json({ message: "Forbidden: insufficient role." });
    } catch (err) {
      logger.error("Error in hasRole middleware:", err);
      return res.status(500).json({ message: "Server error in role check." });
    }
  };
}

const studentGoalSchema = Joi.object({
    description: Joi.string().required(),
    target_date: Joi.date().iso().required(),
    progress: Joi.number().min(0).max(100).required(),
    type: Joi.string().valid('academic', 'personal', 'extracurricular').required(),
    is_completed: Joi.boolean().default(false),
    points: Joi.number().integer().min(0).default(0)
});

const goalUpdateSchema = Joi.object({
    description: Joi.string().optional(),
    target_date: Joi.date().iso().optional(),
    progress: Joi.number().min(0).max(100).optional(),
    type: Joi.string().valid('academic', 'personal', 'extracurricular').optional(),
    is_completed: Joi.boolean().optional(),
    points: Joi.number().integer().min(0).optional()
});

// New Joi schema for the add-points route
const addPointsSchema = Joi.object({
  points: Joi.number().integer().required(),
  reason: Joi.string().required(),
  studentIds: Joi.array().items(Joi.string().alphanum().length(24)).optional(),
  grade: Joi.string().optional(),
  program: Joi.string().optional(),
  otherGrade: Joi.string().optional(),
}).oxor('studentIds', 'grade', 'program', 'otherGrade'); // Ensures only one of these fields is present

async function grantReward({ userIds, type, points, description, source = 'System', grantedBy = null }) {
    if (!userIds || userIds.length === 0) {
        logger.warn('No user IDs provided to grantReward function.');
        return;
    }

    try {
        const parsedPoints = parseInt(points, 10);
        if (isNaN(parsedPoints)) {
            logger.error('Invalid points value provided to grantReward.');
            return;
        }

        // Loop through each user ID and grant the reward
        for (const userId of userIds) {
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { $inc: { smart_points: parsedPoints } },
                { new: true }
            );

            if (!updatedUser) {
                logger.warn(`User with ID ${userId} not found, skipping.`);
                continue;
            }

            let studentRewards = await StudentRewards.findOne({ studentId: userId });
            if (!studentRewards) {
                studentRewards = new StudentRewards({ studentId: userId, pointsLog: [] });
            }

            studentRewards.pointsLog.push({
                points: parsedPoints,
                source,
                description,
                date: new Date()
            });
            await studentRewards.save();

            const reward = new Reward({
                user_id: userId,
                type,
                points: parsedPoints,
                description,
                granted_by: grantedBy
            });
            await reward.save();
        }

        logger.info(`Successfully granted ${parsedPoints} points to ${userIds.length} users.`);
    } catch (err) {
        logger.error('Error in grantReward helper:', err);
    }
}

const PREMIUM_MILESTONES = {
    '10-goals-in-a-month': {
        name: 'The Productivity Pro',
        description: 'Completed 10 goals in a single month.',
        reward: 'Party/Social Mixer Invitation'
    },
    '5-assignments-graded-100': {
        name: 'Top Scholar',
        description: 'Achieved a perfect score on 5 consecutive assignments.',
        reward: 'Movie Ticket Voucher'
    },
    '6-months-of-consistency': {
        name: 'Consistency Champ',
        description: 'Maintained a goal streak for six consecutive months.',
        reward: 'Lunch Treat'
    },
    'student-of-the-year': {
        name: 'Student of the Year',
        description: 'Voted top student by your peers and teachers.',
        reward: 'Trip to a Historical Place'
    }
};

const calculateBasicRewards = (student) => {
    const badges = [];
    if (student.weeklyGoalsAchieved) badges.push('🏅 Goal Crusher');
    if (student.weeklyBudgetMet) badges.push('💰 Budget Boss');
    if (student.weeklyAssignmentsDone) badges.push('📘 Assignment Ace');
    if (student.termPercentage >= 90) badges.push('🎓 Top Scholar');
    if (student.consistentMonths >= 6) badges.push('🔥 Consistency Champ');

    let termSummary = '';
    let termRewards = [];
    if (student.level === 'High School' && student.termPercentage >= 80) {
        termSummary = `Your term performance is ${student.termPercentage}%. 🎉 You're eligible for end-of-term rewards!`;
        termRewards = ['🏖️ Vacation Package', '📜 Certificate of Excellence', '🍕 Pizza Treat'];
    } else if ((student.level === 'University' || student.level === 'Worker') && student.consistentMonths >= 6) {
        termSummary = `👏 You've consistently achieved your goals for ${student.consistentMonths} months!`;
        termRewards = ['🎁 Surprise Gift or Brunch', '🎬 Movie Pass', '🏅 Special Recognition Badge'];
    } else {
        termSummary = `You're on the path to rewards! Stay consistent to unlock treats and recognition.`;
    }

    const treatSuggestions = [
        '🌴 Vacation trip to historical or beach resorts',
        '🍽️ Weekend Date Treats at student-friendly restaurants',
        '🎓 Certificates of Achievement',
        '🎬 Movie night or amusement park visit',
        '🎉 Hangouts & Social mixers for consistent achievers',
        '🏅 Badges: "Goal Crusher", "Budget Boss", "Assignment Ace"',
        '🎨 Buy art supplies for a new hobby',
        '💻 A new video game or console accessory',
        '📚 A subscription to an online learning platform',
        '🎧 A premium music streaming subscription',
    ];

    return { badges, termSummary, termRewards, treatSuggestions };
};

const calculatePremiumRewards = (user) => {
    const premiumRewards = [];
    if (user && user.earnedBadges) {
        user.earnedBadges.forEach(badgeId => {
            const badgeDetails = PREMIUM_MILESTONES[badgeId];
            if (badgeDetails) {
                premiumRewards.push({
                    id: badgeId,
                    name: badgeDetails.name,
                    description: badgeDetails.description,
                    reward: badgeDetails.reward
                });
            }
        });
    }
    return premiumRewards;
};

const calculateAllRewards = (student, user) => {
    const basicRewards = calculateBasicRewards(student);
    const premiumRewards = calculatePremiumRewards(user);
    return { ...basicRewards, premiumRewards };
};


async function generateGeminiAdviceWithRetry(payload, retries = 3) {
  const apiKey = process.env.GEMINI_API_KEY; 
  if (!apiKey) {
    throw new Error("API key is not configured.");
  }
  const apiUrlWithKey = `${API_URL}${apiKey}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(apiUrlWithKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`API call failed with status ${response.status}: ${errorText}`);
        throw new Error(`API call failed with status ${response.status}`);
      }

      const result = await response.json();
      const generatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        logger.error(`Gemini API returned an empty or invalid response on attempt ${attempt}. Full response: ${JSON.stringify(result)}`);
        throw new Error("Invalid or empty response from Gemini API.");
      }

      const advice = JSON.parse(generatedText);
      if (!advice || !advice.studyAdvice || !advice.spendingAdvice) {
          throw new Error("Invalid JSON format or missing keys in API response.");
      }

      return advice;
    } catch (err) {
      logger.warn(`Gemini API attempt ${attempt} failed:`, err.message);
      if (attempt === retries) {
        logger.error("All Gemini API attempts failed. Final error:", err);
        throw err;
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

router.get('/advice', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.is_on_trial && user.trialInsightsUsed >= user.trialInsightsLimit) {
            return res.status(403).json({
                message: `Trial limit reached. You can only generate ${user.trialInsightsLimit} AI insights. Please subscribe to continue.`,
            });
        }

        const studentData = await StudentRewards.findOne({ studentId: userId });
        const budgetData = await BudgetEntry.find({ userId });

        let advice;
        if (!studentData) {
            advice = {
                studyAdvice: "Start setting goals to get personalized advice!",
                spendingAdvice: "Log your first budget entry to get financial tips!",
            };
        } else {
            const studentInfo = `Student Name: ${studentData.name}
                Term Percentage: ${studentData.termPercentage}%
                Consistent Months: ${studentData.consistentMonths}
                Weekly Goals Achieved: ${studentData.weeklyGoalsAchieved}
                Current Goals: ${studentData.goals.map(g => g.description).join(', ')}`;

            const spendingByCategory = {};
            budgetData.filter(e => e.type === 'expense').forEach(entry => {
                spendingByCategory[entry.category] = (spendingByCategory[entry.category] || 0) + entry.amount;
            });

            const budgetInfo = `Budgeting Data (past month):
                Total Expenses: $${budgetData.reduce((sum, entry) => entry.type === 'expense' ? sum + entry.amount : sum, 0)}
                Spending by Category: ${JSON.stringify(spendingByCategory, null, 2)}`;

            const prompt = `Based on the following user data, provide concise and actionable advice on their goals and spending habits.
                
                Student Data:
                ${studentInfo}

                Budget Data:
                ${budgetInfo}

                Please provide a short, encouraging message for their study goals and a clear, helpful tip for their financial habits. Format the response as a JSON object with two keys: "studyAdvice" and "spendingAdvice". Example: {"studyAdvice": "...", "spendingAdvice": "..."}
                `;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "studyAdvice": { type: "STRING" },
                            "spendingAdvice": { type: "STRING" }
                        }
                    }
                }
            };
            advice = await generateGeminiAdviceWithRetry(payload, 3);
        }

        if (user.is_on_trial) {
            user.trialInsightsUsed = (user.trialInsightsUsed || 0) + 1;
            await user.save();
        }

        res.status(200).json({ advice });
    } catch (error) {
        logger.error('Error fetching personalized advice:', error);
        res.status(500).json({ message: 'Failed to fetch advice.' });
    }
});


router.post(
    "/teacher/add-points",
    authenticateJWT,
    hasRole(["teacher", "admin"]),
    async (req, res) => {
        try {
            // Validate with Joi schema
            const { error, value } = addPointsSchema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    status: 'Validation Error',
                    message: error.details[0].message
                });
            }

            const { points, reason, studentIds, grade, program, otherGrade } = value;
            let studentsToUpdate = [];

            if (studentIds) {
                // Find students by an array of IDs
                const students = await User.find({ _id: { $in: studentIds } });
                studentsToUpdate = students.map(s => s._id);
            } else if (grade) {
                // Find students by an entire grade
                const students = await User.find({ grade: grade, role: "student" });
                studentsToUpdate = students.map(s => s._id);
            } else if (program) {
                // Find students by program
                const students = await User.find({ program: program, role: "student" });
                studentsToUpdate = students.map(s => s._id);
            } else if (otherGrade) {
                // Find students in another grade
                const students = await User.find({ grade: otherGrade, role: "student" });
                studentsToUpdate = students.map(s => s._id);
            }

            if (studentsToUpdate.length === 0) {
                return res.status(404).json({ message: "No students found for the given criteria." });
            }

            const sourceRole = req.user.role === "admin" ? "Admin" : "Teacher";

            // Call the updated grantReward function
            await grantReward({
                userIds: studentsToUpdate,
                type: 'teacher_grant',
                points: points,
                description: reason,
                source: sourceRole,
                grantedBy: req.user.id
            });

            res.status(200).json({
                message: `Successfully added ${points} points to ${studentsToUpdate.length} students.`,
            });
        } catch (error) {
            logger.error("Error adding points:", error);
            res.status(500).json({ message: "Server error occurred while adding points." });
        }
    }
);

router.get(
    "/teacher/view-points/:studentId",
    authenticateJWT,
    hasRole(["teacher", "admin"]),
    async (req, res) => {
        try {
            const { studentId } = req.params;

            const student = await User.findById(studentId).select("firstname lastname smart_points");
            if (!student) {
                return res.status(404).json({ message: "Student not found." });
            }

            const studentRewards = await StudentRewards.findOne({ studentId: student._id });

            res.status(200).json({
                student: {
                    id: student._id,
                    name: `${student.firstname} ${student.lastname}`,
                    smart_points: student.smart_points || 0,
                },
                pointsLog: studentRewards ? studentRewards.pointsLog : [],
            });
        } catch (error) {
            logger.error("Error fetching student points:", error);
            res.status(500).json({ message: "Server error occurred while fetching points." });
        }
    }
);

router.post('/milestone-completed', authenticateJWT, checkSubscription, async (req, res) => {
    try {
        const { milestoneId } = req.body;
        const userId = req.user.userId;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!PREMIUM_MILESTONES[milestoneId]) {
            return res.status(400).json({ message: 'Invalid milestone ID.' });
        }

        if (user.earnedBadges.includes(milestoneId)) {
            return res.status(200).json({ message: 'Badge already earned.' });
        }

        user.earnedBadges.push(milestoneId);
        await user.save();

        logger.info(`User ${userId} earned premium badge: ${milestoneId}`);
        const badgeName = PREMIUM_MILESTONES[milestoneId].name;
        const reward = PREMIUM_MILESTONES[milestoneId].reward;

        res.status(200).json({
            message: `Congratulations! You earned the "${badgeName}" badge and a "${reward}" reward.`,
            newReward: { id: milestoneId, name: badgeName, reward: reward }
        });

    } catch (error) {
        logger.error('Error processing premium milestone:', error);
        res.status(500).json({ message: 'Server error occurred while processing milestone.' });
    }
});


router.post('/goals', authenticateJWT, async (req, res) => {
    const { error, value } = studentGoalSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });
    }

    try {
        const userId = req.user.id;

        let studentGoals = await StudentRewards.findOne({ studentId: userId });
        if (!studentGoals) {
            studentGoals = new StudentRewards({ studentId: userId });
        }

        studentGoals.goals.push(value);
        await studentGoals.save();
        
        eventBus.emit('goal_notification', {
            userId,
            message: `New goal created: ${value.description}`
        });

        res.status(201).json({ message: 'Goal added successfully!', goal: value });

    } catch (error) {
        logger.error('Error adding new goal:', error);
        res.status(500).json({ message: 'Failed to add goal.' });
    }
});

router.get('/goals', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const studentGoals = await StudentRewards.findOne({ studentId: userId });

        if (!studentGoals) {
            return res.status(200).json({ goals: [] });
        }

        res.status(200).json({ goals: studentGoals.goals });

    } catch (error) {
        logger.error('Error fetching goals:', error);
        res.status(500).json({ message: 'Failed to fetch goals.' });
    }
});

router.put('/goals/:goalId', authenticateJWT, async (req, res) => {
    const { error, value } = goalUpdateSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });
    }

    try {
        const userId = req.user.id;
        const { goalId } = req.params;

        const studentGoals = await StudentRewards.findOne({ studentId: userId });
        if (!studentGoals) {
            return res.status(404).json({ message: 'Student goals not found.' });
        }

        const goal = studentGoals.goals.id(goalId);
        if (!goal) {
            return res.status(404).json({ message: 'Goal not found.' });
        }

        Object.assign(goal, value);
        
        await studentGoals.save();

        res.status(200).json({ message: 'Goal updated successfully!', goal });

    } catch (error) {
        logger.error('Error updating goal:', error);
        res.status(500).json({ message: 'Failed to update goal.' });
    }
});

router.delete('/goals/:goalId', authenticateJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const { goalId } = req.params;

        const studentGoals = await StudentRewards.findOne({ studentId: userId });
        if (!studentGoals) {
            return res.status(404).json({ message: 'Student goals not found.' });
        }

        const goalIndex = studentGoals.goals.findIndex(g => g._id.toString() === goalId);
        if (goalIndex === -1) {
            return res.status(404).json({ message: 'Goal not found.' });
        }

        studentGoals.goals.splice(goalIndex, 1);
        await studentGoals.save();
        
        eventBus.emit('goal_notification', {
            userId,
            message: `Goal deleted.`
        });

        res.status(200).json({ message: 'Goal deleted successfully.' });

    } catch (error) {
        logger.error('Error deleting goal:', error);
        res.status(500).json({ message: 'Failed to delete goal.' });
    }
});

router.get('/:studentId', authenticateJWT, checkSubscription, async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const student = await StudentRewards.findOne({ studentId });
        const user = await User.findById(req.user.userId);

        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        const { badges, termSummary, termRewards, treatSuggestions, premiumRewards } = calculateAllRewards(student, user);
        const weeklyMessage = `Keep pushing ${student.name}! You're closer to your next badge. 💪`;

        res.status(200).json({
            name: student.name,
            weeklyMessage,
            badges,
            termSummary,
            termRewards,
            treatSuggestions,
            premiumRewards
        });

    } catch (error) {
        logger.error('Error fetching combined rewards:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;