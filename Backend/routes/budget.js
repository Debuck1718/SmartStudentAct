const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const Joi = require('joi');
const eventBus = require('../utils/eventBus');

const { authenticateJWT } = require('../middlewares/auth');
const checkSubscription = require('../middlewares/checkSubscription');
const BudgetEntry = require('../models/BudgetEntry');


const budgetEntrySchema = Joi.object({
  amount: Joi.number().positive().required(),
  category: Joi.string().required(),
  description: Joi.string().allow('', null),
  type: Joi.string().valid('income', 'expense').required(),
  date: Joi.date().iso().required()
});

const budgetUpdateSchema = Joi.object({
  amount: Joi.number().positive().optional(),
  category: Joi.string().optional(),
  description: Joi.string().allow('', null).optional(),
  type: Joi.string().valid('income', 'expense').optional(),
  date: Joi.date().iso().optional()
});

const budgetEntryIdSchema = Joi.object({
  entryId: Joi.string().length(24).hex().required()
});


router.post('/add-entry', authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = budgetEntrySchema.validate(req.body);
  if (error) return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });

  try {
    const newEntry = new BudgetEntry({
      userId: req.userId,
      amount: value.amount,
      category: value.category,
      description: value.description || '',
      type: value.type,
      date: new Date(value.date)
    });

    await newEntry.save();

    eventBus.emit('budget_notification', {
      userId: req.userId,
      message: `New ${value.type} entry for $${value.amount} has been added.`
    });

    res.status(201).json({ message: 'Budget entry added successfully.', entry: newEntry });

  } catch (err) {
    logger.error('Error adding budget entry:', err);
    res.status(500).json({ message: 'Failed to add budget entry.', error: err.message });
  }
});


router.get('/dashboard', authenticateJWT, checkSubscription, async (req, res) => {
  try {
    const entries = await BudgetEntry.find({ userId: req.userId }).sort({ date: 1 });

    let totalIncome = 0, totalExpenses = 0;
    const spendingByCategory = {};
    const incomeByCategory = {};

    entries.forEach(({ amount, category, type }) => {
      if (type === 'expense') {
        totalExpenses += amount;
        spendingByCategory[category] = (spendingByCategory[category] || 0) + amount;
      } else {
        totalIncome += amount;
        incomeByCategory[category] = (incomeByCategory[category] || 0) + amount;
      }
    });

    res.status(200).json({
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      spendingByCategory,
      incomeByCategory,
      entries
    });
  } catch (err) {
    logger.error('Error loading budget dashboard:', err);
    res.status(500).json({ message: 'Failed to load budget dashboard.', error: err.message });
  }
});


router.get('/entries', authenticateJWT, async (req, res) => {
  try {
    const entries = await BudgetEntry.find({ userId: req.userId }).sort({ date: -1 });
    res.status(200).json({ entries });
  } catch (err) {
    logger.error('Error fetching all budget entries:', err);
    res.status(500).json({ message: 'Failed to fetch budget entries.', error: err.message });
  }
});


router.get('/entries/:entryId', authenticateJWT, async (req, res) => {
  const { error } = budgetEntryIdSchema.validate(req.params);
  if (error) return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });

  try {
    const entry = await BudgetEntry.findOne({ _id: req.params.entryId, userId: req.userId });
    if (!entry) return res.status(404).json({ message: 'Budget entry not found.' });
    res.status(200).json({ entry });
  } catch (err) {
    logger.error('Error fetching single budget entry:', err);
    res.status(500).json({ message: 'Failed to fetch budget entry.', error: err.message });
  }
});

// Update entry
router.put('/entries/:entryId', authenticateJWT, async (req, res) => {
  const { error: idError } = budgetEntryIdSchema.validate(req.params);
  if (idError) return res.status(400).json({ status: 'Validation Error', message: idError.details[0].message });

  const { error: updateError, value } = budgetUpdateSchema.validate(req.body);
  if (updateError) return res.status(400).json({ status: 'Validation Error', message: updateError.details[0].message });

  try {
    const updatedEntry = await BudgetEntry.findOneAndUpdate(
      { _id: req.params.entryId, userId: req.userId },
      { $set: value },
      { new: true }
    );

    if (!updatedEntry) return res.status(404).json({ message: 'Budget entry not found.' });

    res.status(200).json({ message: 'Budget entry updated successfully.', entry: updatedEntry });
  } catch (err) {
    logger.error('Error updating budget entry:', err);
    res.status(500).json({ message: 'Failed to update budget entry.', error: err.message });
  }
});

// Delete entry
router.delete('/entries/:entryId', authenticateJWT, async (req, res) => {
  const { error } = budgetEntryIdSchema.validate(req.params);
  if (error) return res.status(400).json({ status: 'Validation Error', message: error.details[0].message });

  try {
    const deletedEntry = await BudgetEntry.findOneAndDelete({ _id: req.params.entryId, userId: req.userId });
    if (!deletedEntry) return res.status(404).json({ message: 'Budget entry not found.' });

    eventBus.emit('budget_notification', {
      userId: req.userId,
      message: `A ${deletedEntry.type} entry has been deleted.`
    });

    res.status(200).json({ message: 'Budget entry deleted successfully.' });
  } catch (err) {
    logger.error('Error deleting budget entry:', err);
    res.status(500).json({ message: 'Failed to delete budget entry.', error: err.message });
  }
});

module.exports = router;

