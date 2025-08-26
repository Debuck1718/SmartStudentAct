// smartstudent-backend/routes/advancedGoals.js

const express = require('express');
const router = express.Router();
const Joi = require('joi'); 
const logger = require('../utils/logger');
const geminiClient = require('../utils/geminiClient');
const eventBus = require('../utils/eventBus');

// Import models and middlewares
const StudentRewards = require('../models/StudentRewards');
const User = require('../models/User'); 
const Reward = require('../models/Reward');
const BudgetEntry = require('../models/BudgetEntry');
// ✅ FIX: The auth middleware exports 'requireAdmin', not 'hasRole'. 
// We are importing the correct function now.
const { authenticateJWT, requireAdmin } = require('../middlewares/auth');
const checkSubscription = require('../middlewares/checkSubscription');


/**
 * Joi Validation Schemas
 */
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


/**
 * @desc Helper function to grant a reward.
 * @desc It uses an atomic update ($inc) to safely increment smart_points on the User model,
 * @desc preventing race conditions where simultaneous updates might overwrite each other.
 * @param {Object} args
 * @param {string} args.userId - The ID of the user to grant the reward to.
 * @param {string} args.type - The type of reward.
 * @param {number} args.points - The number of points to grant.
 * @param {string} args.description - A description of the reward.
 * @param {string} [args.source='System'] - The source of the reward (e.g., 'System', 'Teacher').
 * @param {string} [args.grantedBy=null] - The ID of the user who granted the reward (if applicable).
 */
async function grantReward({ userId, type, points, description, source = 'System', grantedBy = null }) {
    try {
        // Use $inc for atomic point updates to prevent race conditions.
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { smart_points: points || 0 } },
            { new: true } // Return the updated document
        );

        if (!updatedUser) return;

        // Log the point change in the StudentRewards document
        let studentRewards = await StudentRewards.findOne({ studentId: userId });
        if (studentRewards) {
            studentRewards.pointsLog.push({
                points,
                source,
                description,
                date: new Date()
            });
            await studentRewards.save();
        }

        // Log the reward in the Reward collection for a comprehensive history
        const reward = new Reward({
            user_id: userId,
            type,
            points,
            description,
            granted_by: grantedBy
        });
        await reward.save();

    } catch (err) {
        logger.error('Error in grantReward helper:', err);
    }
}


// This object defines the tangible, premium rewards and their associated milestones.
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

/**
 * @desc Calculates and returns basic rewards based on student data.
 * @param {Object} student - The StudentRewards document.
 * @returns {Object} An object containing badges, summaries, and suggestions.
 */
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

/**
 * @desc Calculates and returns premium rewards based on a user's earned badges.
 * @param {Object} user - The User model document.
 * @returns {Array} An array of premium rewards.
 */
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

// A wrapper to combine basic and premium reward calculation
const calculateAllRewards = (student, user) => {
    const basicRewards = calculateBasicRewards(student);
    const premiumRewards = calculatePremiumRewards(user);
    return { ...basicRewards, premiumRewards };
};


//-----------------------------------------------------------------------------------------------------------------------

// New function to generate advice using the Gemini API
const generateGeminiAdvice = async (student, budgetEntries) => {
    // 1. Prepare the prompt with all relevant user data
    const studentInfo = `Student Name: ${student.name}
    Term Percentage: ${student.termPercentage}%
    Consistent Months: ${student.consistentMonths}
    Weekly Goals Achieved: ${student.weeklyGoalsAchieved}
    Current Goals: ${student.goals.map(g => g.description).join(', ')}`;
    
    // Calculate total expenses and group them by category
    const spendingByCategory = {};
    budgetEntries.filter(e => e.type === 'expense').forEach(entry => {
        spendingByCategory[entry.category] = (spendingByCategory[entry.category] || 0) + entry.amount;
    });

    const budgetInfo = `Budgeting Data (past month):
    Total Expenses: $${budgetEntries.reduce((sum, entry) => entry.type === 'expense' ? sum + entry.amount : sum, 0)}
    Spending by Category: ${JSON.stringify(spendingByCategory, null, 2)}`;

    const prompt = `Based on the following user data, provide concise and actionable advice on their goals and spending habits.
    
    Student Data:
    ${studentInfo}

    Budget Data:
    ${budgetInfo}

    Please provide a short, encouraging message for their study goals and a clear, helpful tip for their financial habits. Format the response as a JSON object with two keys: "studyAdvice" and "spendingAdvice". Example: {"studyAdvice": "...", "spendingAdvice": "..."}
    `;

    try {
        const geminiResponse = await geminiClient.generateContent(prompt);
        return JSON.parse(geminiResponse.text);

    } catch (error) {
        logger.error('Error with Gemini API:', error);
        return {
            studyAdvice: "Keep working hard on your goals!",
            spendingAdvice: "Track your expenses to stay on top of your budget."
        };
    }
};

// New Endpoint to get personalized advice
// ⚠️ FIX: The route path is updated to remove the studentId parameter for security.
// The frontend must be updated to call '/api/rewards/advice' instead of '/api/rewards/advice/:studentId'
router.get('/advice', authenticateJWT, checkSubscription, async (req, res) => {
    try {
        // Use the authenticated user's ID to prevent unauthorized access to other students' data.
        const userId = req.user.userId;

        // Fetch both goal and budget data
        const studentData = await StudentRewards.findOne({ studentId: userId });
        const budgetData = await BudgetEntry.find({ userId }); // Fetch budget data

        if (!studentData) {
            // It's acceptable to return an empty advice object if no student data exists.
            return res.status(200).json({ 
                advice: {
                    studyAdvice: "Start setting goals to get personalized advice!",
                    spendingAdvice: "Log your first budget entry to get financial tips!"
                }
            });
        }

        // Generate personalized advice using the combined data
        const advice = await generateGeminiAdvice(studentData, budgetData);

        res.status(200).json({ advice });

    } catch (error) {
        logger.error('Error fetching personalized advice:', error);
        res.status(500).json({ message: 'Failed to fetch advice.' });
    }
});
//-----------------------------------------------------------------------------------------------------------------------

// Route for a teacher/admin to add points to a student (Basic)
// 🆕 Updated path to match frontend
// ✅ FIX: Changed `hasRole('teacher')` to the `requireAdmin` middleware, as it's the correct function exported by auth.js
router.post('/teacher/add-points', authenticateJWT, requireAdmin, async (req, res) => {
    try {
        const { studentEmail, points, reason } = req.body;
        if (!studentEmail || points === undefined || !reason) {
            return res.status(400).json({ message: 'Missing required fields.' });
        }

        const student = await User.findOne({ email: studentEmail });
        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }
        
        // ⚠️ FIX: Use an atomic operation to prevent race conditions on point updates.
        await User.findByIdAndUpdate(student._id, { $inc: { smart_points: parseInt(points, 10) } });

        // Add a log of the points to the student's rewards document
        const studentRewards = await StudentRewards.findOne({ studentId: student._id });
        if (studentRewards) {
             studentRewards.pointsLog.push({ 
                 points, 
                 source: 'Teacher', 
                 description: reason,
                 date: new Date()
             });
             await studentRewards.save();
        }

        res.status(200).json({ message: `Successfully added ${points} points to ${student.firstname}.` });
    } catch (error) {
        logger.error('Error adding points:', error);
        res.status(500).json({ message: 'Server error occurred while adding points.' });
    }
});

// Route to check for and award a premium milestone
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

/**
 * @route POST /api/rewards/goals
 * @desc Allows a student to add a new goal.
 * @access Private
 */
router.post('/goals', authenticateJWT, async (req, res) => {
    // Validate the incoming request body using Joi
    const { error, value } = studentGoalSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });
    }

    try {
        const userId = req.user.id;

        // Find the user's goals document or create a new one
        let studentGoals = await StudentRewards.findOne({ studentId: userId });
        if (!studentGoals) {
            studentGoals = new StudentRewards({ studentId: userId, name: req.user.firstname });
        }

        // Add the new goal from the validated value
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

/**
 * @route GET /api/rewards/goals
 * @desc Gets all goals for the authenticated user.
 * @access Private
 */
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

/**
 * @route PUT /api/rewards/goals/:goalId
 * @desc Updates a specific goal for the authenticated user.
 * @access Private
 */
router.put('/goals/:goalId', authenticateJWT, async (req, res) => {
    // Validate the incoming request body using the update schema
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

        // Update the goal fields with the validated data
        Object.assign(goal, value);
        
        await studentGoals.save();

        res.status(200).json({ message: 'Goal updated successfully!', goal });

    } catch (error) {
        logger.error('Error updating goal:', error);
        res.status(500).json({ message: 'Failed to update goal.' });
    }
});

/**
 * @route DELETE /api/rewards/goals/:goalId
 * @desc Deletes a specific goal for the authenticated user.
 * @access Private
 */
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
/**
 * @route GET /api/rewards/:studentId
 * @desc Get a student's combined rewards (basic + premium)
 * @access Private
 * ⚠️ Must be placed LAST so it doesn’t override other routes like /advice or /goals
 */
router.get('/:studentId', authenticateJWT, checkSubscription, async (req, res) => {
    try {
        const studentId = req.params.studentId;
        const student = await StudentRewards.findOne({ studentId });
        const user = await User.findById(req.user.userId);

        if (!student) {
            return res.status(404).json({ message: 'Student not found.' });
        }

        // Pass both the StudentRewards and the User model data to the calculation function
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