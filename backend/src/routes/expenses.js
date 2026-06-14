const express = require('express');
const router = express.Router({ mergeParams: true }); // Merge params to get :groupId
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { computeSplits, round2 } = require('../utils/splitCalculator');

// Apply auth middleware to all expense routes
router.use(authMiddleware);

/**
 * GET /api/groups/:groupId/expenses
 * 
 * Purpose:
 * Retrieves all non-deleted expenses for a specific group.
 * Includes details on the payer and the individual splits.
 * 
 * Requirements:
 * - Filter out soft-deleted expenses (isDeleted: false).
 * - Sort by date descending.
 */
router.get('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId, isDeleted: false },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      },
      orderBy: { date: 'desc' }
    });

    res.json(expenses);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/groups/:groupId/expenses
 * 
 * Purpose:
 * Creates a new expense in the group.
 * Recalculates individual splits, converts currency to INR,
 * and inserts the expense and splits atomically using a transaction.
 * 
 * Requirements:
 * - Convert USD to INR using provided exchange rate or standard default (83.5).
 * - Invoke splitCalculator to distribute shares.
 * - Store original currency and conversion rates.
 */
router.post('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const {
      description,
      amount,
      currency = 'INR',
      exchangeRate,
      paidById,
      splitType,
      date,
      notes,
      participants,
      splitDetails
    } = req.body;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }
    if (!description || !amount || !paidById || !splitType || !date || !participants || participants.length === 0) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }

    // Determine exchange rate and compute amount in INR
    let rate = 1;
    let amountInr = Number(amount);

    if (currency === 'USD') {
      rate = exchangeRate ? Number(exchangeRate) : 83.5;
      amountInr = round2(Number(amount) * rate);
    } else {
      rate = 1;
    }

    // Validate and compute splits (results in array of { userId, share, amountOwed })
    let computedSplits;
    try {
      computedSplits = computeSplits(amountInr, splitType, participants, splitDetails);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    // Execute atomic transaction in database
    const expense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          description,
          amount: Number(amount),
          currency,
          amountInr,
          exchangeRate: currency === 'USD' ? rate : null,
          paidById: parseInt(paidById),
          splitType,
          date: new Date(date),
          notes
        }
      });

      // Insert splits
      await tx.expenseSplit.createMany({
        data: computedSplits.map(s => ({
          expenseId: exp.id,
          userId: s.userId,
          share: s.share,
          amountOwed: s.amountOwed
        }))
      });

      return exp;
    });

    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/groups/:groupId/expenses/:id
 * 
 * Purpose:
 * Retrieves a single expense item by ID.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }

    const expense = await prisma.expense.findFirst({
      where: { id, isDeleted: false },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/groups/:groupId/expenses/:id
 * 
 * Purpose:
 * Updates details of an existing expense.
 * Re-runs split calculator and updates both expense and splits atomically.
 */
router.patch('/:id', async (req, res, next) => {
  try {
    const expenseId = parseInt(req.params.id);
    const {
      description,
      amount,
      currency,
      exchangeRate,
      paidById,
      splitType,
      date,
      notes,
      participants,
      splitDetails
    } = req.body;

    if (isNaN(expenseId)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }

    // Get existing expense to merge fields
    const existing = await prisma.expense.findUnique({
      where: { id: expenseId }
    });
    if (!existing || existing.isDeleted) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const nextAmount = amount !== undefined ? Number(amount) : Number(existing.amount);
    const nextCurrency = currency !== undefined ? currency : existing.currency;
    let nextRate = 1;
    let nextAmountInr = nextAmount;

    if (nextCurrency === 'USD') {
      nextRate = exchangeRate !== undefined ? Number(exchangeRate) : (existing.exchangeRate ? Number(existing.exchangeRate) : 83.5);
      nextAmountInr = round2(nextAmount * nextRate);
    }

    // Recompute splits if details, amount, or participants change
    let computedSplits = null;
    if (participants && splitType) {
      try {
        computedSplits = computeSplits(nextAmountInr, splitType, participants, splitDetails);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.update({
        where: { id: expenseId },
        data: {
          description,
          amount: nextAmount,
          currency: nextCurrency,
          amountInr: nextAmountInr,
          exchangeRate: nextCurrency === 'USD' ? nextRate : null,
          paidById: paidById !== undefined ? parseInt(paidById) : existing.paidById,
          splitType: splitType || existing.splitType,
          date: date ? new Date(date) : existing.date,
          notes
        }
      });

      if (computedSplits) {
        // Delete old splits and create new ones
        await tx.expenseSplit.deleteMany({ where: { expenseId } });
        await tx.expenseSplit.createMany({
          data: computedSplits.map(s => ({
            expenseId: exp.id,
            userId: s.userId,
            share: s.share,
            amountOwed: s.amountOwed
          }))
        });
      }

      return exp;
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/groups/:groupId/expenses/:id
 * 
 * Purpose:
 * Soft deletes an expense.
 * Set isDeleted: true instead of raw database deletion.
 * (Meera's requirement for auditing/reviewing expense history).
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const expenseId = parseInt(req.params.id);
    if (isNaN(expenseId)) {
      return res.status(400).json({ error: 'Invalid expense ID' });
    }

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: { isDeleted: true }
    });

    res.json({ message: 'Expense soft-deleted successfully', id: updated.id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
