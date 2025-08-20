const Joi = require('joi');

// For setting admin rights directly
const setAdminSchema = Joi.object({
    email: Joi.string().email().required(),
    make_admin: Joi.boolean().required(),
    role: Joi.string().min(2).max(50).required()
});

// For promoting a user to admin
const promoteUserSchema = Joi.object({
    userId: Joi.string().required(),
    role: Joi.string().min(2).max(50).required()
});

// For removing a user
const removeUserSchema = Joi.object({
    email: Joi.string().email().required()
});

module.exports = {
    setAdminSchema,
    promoteUserSchema,
    removeUserSchema
};
