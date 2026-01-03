import express from "express";
import Joi from "joi";
import logger from "../utils/logger.js";
import eventBus, { agenda } from '../utils/eventBus.js';import { authenticateJWT } from "../middlewares/auth.js";
import checkSubscription from "../middlewares/checkSubscription.js";
import BudgetEntry from "../models/BudgetEntry.js";

const router = express.Router();

// ===== Validation Schemas =====
const budgetEntrySchema = Joi.object({
  amount: Joi.number().positive().required(),
  category: Joi.string().required(),
  description: Joi.string().allow("", null),
  type: Joi.string().valid("income", "expense").required(),
  date: Joi.date().iso().required(),
});

const budgetUpdateSchema = Joi.object({
  amount: Joi.number().positive().optional(),
  category: Joi.string().optional(),
  description: Joi.string().allow("", null).optional(),
  type: Joi.string().valid("income", "expense").optional(),
  date: Joi.date().iso().optional(),
});

const budgetEntryIdSchema = Joi.object({
  entryId: Joi.string().length(24).hex().required(),
});

// ===== Routes =====

// ➕ Create Entry
router.post("/add-entry", authenticateJWT, checkSubscription, async (req, res) => {
  const { error, value } = budgetEntrySchema.validate(req.body);
  if (error)
    return res.status(400).json({
      status: "Validation Error",
      message: error.details[0].message,
    });

  try {
    const entry = await BudgetEntry.create({
      userId: req.userId,
      ...value,
      date: new Date(value.date),
    });

    eventBus.emit("budget_notification", {
      userId: req.userId,
      message: `New ${value.type} entry of $${value.amount} added.`,
    });

    res.status(201).json({ message: "Budget entry added successfully.", entry });
  } catch (err) {
    logger.error("Error adding budget entry:", err);
    res
      .status(500)
      .json({ message: "Failed to add budget entry.", error: err.message });
  }
});

// 📊 Dashboard Summary
router.get("/dashboard", authenticateJWT, checkSubscription, async (req, res) => {
  try {
    const entries = await BudgetEntry.find({ userId: req.userId }).sort({ date: 1 });

    let totalIncome = 0,
      totalExpenses = 0;
    const spendingByCategory = {},
      incomeByCategory = {};

    for (const { amount, category, type } of entries) {
      if (type === "expense") {
        totalExpenses += amount;
        spendingByCategory[category] =
          (spendingByCategory[category] || 0) + amount;
      } else {
        totalIncome += amount;
        incomeByCategory[category] =
          (incomeByCategory[category] || 0) + amount;
      }
    }

    res.status(200).json({
      totalIncome,
      totalExpenses,
      netBalance: totalIncome - totalExpenses,
      spendingByCategory,
      incomeByCategory,
      entries,
    });
  } catch (err) {
    logger.error("Error loading budget dashboard:", err);
    res.status(500).json({
      message: "Failed to load budget dashboard.",
      error: err.message,
    });
  }
});

// 📋 Get All Entries
router.get("/entries", authenticateJWT, async (req, res) => {
  try {
    const entries = await BudgetEntry.find({ userId: req.userId }).sort({
      date: -1,
    });
    res.status(200).json({ entries });
  } catch (err) {
    logger.error("Error fetching budget entries:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch budget entries.", error: err.message });
  }
});

// 🔍 Get Single Entry
router.get("/entries/:entryId", authenticateJWT, async (req, res) => {
  const { error } = budgetEntryIdSchema.validate(req.params);
  if (error)
    return res.status(400).json({
      status: "Validation Error",
      message: error.details[0].message,
    });

  try {
    const entry = await BudgetEntry.findOne({
      _id: req.params.entryId,
      userId: req.userId,
    });
    if (!entry)
      return res.status(404).json({ message: "Budget entry not found." });
    res.status(200).json({ entry });
  } catch (err) {
    logger.error("Error fetching single budget entry:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch budget entry.", error: err.message });
  }
});

// ✏️ Update Entry
router.put("/entries/:entryId", authenticateJWT, async (req, res) => {
  const { error: idError } = budgetEntryIdSchema.validate(req.params);
  if (idError)
    return res.status(400).json({
      status: "Validation Error",
      message: idError.details[0].message,
    });

  const { error: updateError, value } = budgetUpdateSchema.validate(req.body);
  if (updateError)
    return res.status(400).json({
      status: "Validation Error",
      message: updateError.details[0].message,
    });

  try {
    const updated = await BudgetEntry.findOneAndUpdate(
      { _id: req.params.entryId, userId: req.userId },
      { $set: value },
      { new: true }
    );

    if (!updated)
      return res.status(404).json({ message: "Budget entry not found." });
    res
      .status(200)
      .json({ message: "Budget entry updated successfully.", entry: updated });
  } catch (err) {
    logger.error("Error updating budget entry:", err);
    res
      .status(500)
      .json({ message: "Failed to update budget entry.", error: err.message });
  }
});

// 🗑️ Delete Entry
router.delete("/entries/:entryId", authenticateJWT, async (req, res) => {
  const { error } = budgetEntryIdSchema.validate(req.params);
  if (error)
    return res.status(400).json({
      status: "Validation Error",
      message: error.details[0].message,
    });

  try {
    const deleted = await BudgetEntry.findOneAndDelete({
      _id: req.params.entryId,
      userId: req.userId,
    });
    if (!deleted)
      return res.status(404).json({ message: "Budget entry not found." });

    eventBus.emit("budget_notification", {
      userId: req.userId,
      message: `A ${deleted.type} entry was deleted.`,
    });

    res.status(200).json({ message: "Budget entry deleted successfully." });
  } catch (err) {
    logger.error("Error deleting budget entry:", err);
    res
      .status(500)
      .json({ message: "Failed to delete budget entry.", error: err.message });
  }
});

export default router;

