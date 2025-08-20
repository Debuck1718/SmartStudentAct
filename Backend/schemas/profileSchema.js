// In a file like schemas/profileSchema.js
const Joi = require('joi');

const profileUpdateSchema = Joi.object({
    firstName: Joi.string().min(2).max(50).trim().optional(),
    lastName: Joi.string().min(2).max(50).trim().optional(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).messages({'string.pattern.base': `Phone number must be 10 digits.`}).optional(),
    // Add other fields from your user model that you want to be updatable
    educationLevel: Joi.string().valid('junior', 'high', 'university').optional(),
    grade: Joi.string().optional(),
    schoolName: Joi.string().optional(),
    university: Joi.string().optional(),
    uniLevel: Joi.string().optional(),
    program: Joi.string().optional(),
    teacherSchool: Joi.string().optional(),
    teacherGrade: Joi.string().optional()
});

module.exports = {
    profileUpdateSchema
};