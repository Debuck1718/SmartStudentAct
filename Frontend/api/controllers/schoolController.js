// controllers/schoolController.js

const School = require('../models/School');

const addSchool = async (req, res) => {
  // Extract values from request body
  const { name, schoolCountry, tier } = req.body;

  if (!name || !schoolCountry || !tier) {
    return res
      .status(400)
      .json({ error: 'Missing required fields: name, schoolCountry, and tier.' });
  }

  try {
    const newSchool = new School({
      name,
      schoolCountry,
      tier,
    });

    await newSchool.save();

    res.status(201).json(newSchool);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'A school with this name already exists.' });
    }
    console.error('Error adding school:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = {
  addSchool,
};
