// utils/validator.js
module.exports = function validate(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, { abortEarly: false });

        if (error) {
            // Combine all Joi error messages into one string
            const messages = error.details.map(detail => detail.message);
            return res.status(400).json({ error: messages });
        }

        next();
    };
};
