const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all settlement routes
router.use(authMiddleware);

/**
 * GET /api/groups/:groupId/settlements
 * 
 * Purpose:
 * Retrieves all settlement records logged inside a specific group.
 * Includes user details for both the payer and payee.
 * 
 * Requirements:
 * - Sort settlements by date descending.
 */
router.get('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } }
      },
      orderBy: { date: 'desc' }
    });

    res.json(settlements);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/groups/:groupId/settlements
 * 
 * Purpose:
 * Records a direct payment between two members (payer -> payee).
 * Adjusts the overall net balances of both individuals directly.
 * 
 * Requirements:
 * - Store amount in standard INR format.
 * - Accept custom notes and date.
 */
router.post('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const { payerId, payeeId, amount, currency = 'INR', date, notes } = req.body;

    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }
    if (!payerId || !payeeId || !amount || !date) {
      return res.status(400).json({ error: 'Required fields are missing' });
    }
    if (parseInt(payerId) === parseInt(payeeId)) {
      return res.status(400).json({ error: 'Payer and payee cannot be the same user' });
    }

    const settlement = await prisma.settlement.create({
      data: {
        groupId,
        payerId: parseInt(payerId),
        payeeId: parseInt(payeeId),
        amount: Number(amount),
        currency,
        date: new Date(date),
        notes
      }
    });

    res.status(201).json(settlement);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
