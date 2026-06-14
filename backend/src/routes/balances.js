const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { computeBalances, minimiseTransactions } = require('../services/balanceService');

// Apply auth middleware to all balance routes
router.use(authMiddleware);

/**
 * GET /api/groups/:groupId/balances
 * 
 * Purpose:
 * Calculates net balances, total paid, and total owed for all members in the group.
 * 
 * Requirements:
 * - Net balance = paid - owed.
 * - Format output for a Net Balance Table containing:
 *   Member name, Total paid, Total owed, Net.
 */
router.get('/', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Fetch memberships, expenses (non-deleted), and settlements
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true, email: true } } }
    });

    const expenses = await prisma.expense.findMany({
      where: { groupId, isDeleted: false },
      include: { splits: true }
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId }
    });

    // Compute net balances using the date-filtering service
    const netBalances = computeBalances(expenses, settlements, memberships);

    // Calculate total paid and total owed per user for tabular display
    const totalPaid = {};
    const totalOwed = {};

    memberships.forEach(m => {
      totalPaid[m.userId] = 0;
      totalOwed[m.userId] = 0;
    });

    // Helper to verify if user was active on a date
    const memberMap = {};
    memberships.forEach(m => {
      if (!memberMap[m.userId]) memberMap[m.userId] = [];
      memberMap[m.userId].push(m);
    });

    const isUserActive = (userId, date) => {
      const list = memberMap[userId];
      if (!list) return false;
      const t = new Date(date).getTime();
      return list.some(m => {
        const jt = new Date(m.joinedAt).getTime();
        if (jt > t) return false;
        if (m.leftAt) {
          const lt = new Date(m.leftAt).getTime();
          if (lt < t) return false;
        }
        return true;
      });
    };

    // Sum paid and owed from expenses
    for (const exp of expenses) {
      if (isUserActive(exp.paidById, exp.date)) {
        totalPaid[exp.paidById] = (totalPaid[exp.paidById] || 0) + Number(exp.amountInr);
      }
      for (const split of exp.splits) {
        if (isUserActive(split.userId, exp.date)) {
          totalOwed[split.userId] = (totalOwed[split.userId] || 0) + Number(split.amountOwed);
        }
      }
    }

    // Adjust paid/owed using settlements
    for (const set of settlements) {
      totalPaid[set.payerId] = (totalPaid[set.payerId] || 0) + Number(set.amount);
      totalOwed[set.payeeId] = (totalOwed[set.payeeId] || 0) + Number(set.amount);
    }

    // Build response array
    const response = memberships.map(m => {
      const userId = m.userId;
      const paidAmt = totalPaid[userId] || 0;
      const owedAmt = totalOwed[userId] || 0;
      const netAmt = netBalances[userId] || 0;

      return {
        userId,
        name: m.user.name,
        email: m.user.email,
        totalPaid: Number(paidAmt.toFixed(2)),
        totalOwed: Number(owedAmt.toFixed(2)),
        net: Number(netAmt.toFixed(2))
      };
    });

    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/groups/:groupId/balances/:userId
 * 
 * Purpose:
 * Returns the individual breakdown (contributing expenses and settlements) for a member.
 * This is used to display what specific expenses contribute to a user's net debt or credit.
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    const userId = parseInt(req.params.userId);

    if (isNaN(groupId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    // Query all non-deleted expenses where this user is either payer or in splits
    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
        isDeleted: false,
        OR: [
          { paidById: userId },
          { splits: { some: { userId } } }
        ]
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: { where: { userId } }
      },
      orderBy: { date: 'desc' }
    });

    // Query settlements where the user is payer or payee
    const settlements = await prisma.settlement.findMany({
      where: {
        groupId,
        OR: [
          { payerId: userId },
          { payeeId: userId }
        ]
      },
      include: {
        payer: { select: { id: true, name: true } },
        payee: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' }
    });

    // Format individual log
    const log = [];

    expenses.forEach(exp => {
      const isPayer = exp.paidById === userId;
      const split = exp.splits[0]; // will contain this user's split details
      const owed = split ? Number(split.amountOwed) : 0;
      const paid = isPayer ? Number(exp.amountInr) : 0;

      log.push({
        type: 'EXPENSE',
        id: exp.id,
        description: exp.description,
        date: exp.date,
        paid,
        owed,
        netEffect: paid - owed,
        payerName: exp.paidBy.name,
        totalAmount: Number(exp.amountInr)
      });
    });

    settlements.forEach(set => {
      const isPayer = set.payerId === userId;
      const amount = Number(set.amount);
      const paid = isPayer ? amount : 0;
      const owed = !isPayer ? amount : 0; // if received, it reduces credit (debit effect)

      log.push({
        type: 'SETTLEMENT',
        id: set.id,
        description: isPayer ? `Settlement paid to ${set.payee.name}` : `Settlement received from ${set.payer.name}`,
        date: set.date,
        paid,
        owed,
        netEffect: paid - owed, // paying a settlement increases net, receiving decreases credit
        payerName: set.payer.name,
        totalAmount: amount
      });
    });

    // Sort combined log chronologically descending
    log.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json(log);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/groups/:groupId/settlement-plan
 * 
 * Purpose:
 * Generates the optimized minimum transactions plan to settle all group balances.
 */
router.get('/settlement-plan', async (req, res, next) => {
  try {
    const groupId = parseInt(req.params.groupId);
    if (isNaN(groupId)) {
      return res.status(400).json({ error: 'Invalid group ID' });
    }

    // Fetch memberships, expenses, and settlements
    const memberships = await prisma.groupMembership.findMany({
      where: { groupId },
      include: { user: { select: { id: true, name: true } } }
    });

    const expenses = await prisma.expense.findMany({
      where: { groupId, isDeleted: false },
      include: { splits: true }
    });

    const settlements = await prisma.settlement.findMany({
      where: { groupId }
    });

    // Map users for names
    const usersMap = {};
    memberships.forEach(m => {
      usersMap[m.userId] = m.user;
    });

    // Compute balances and minimize transactions
    const netBalances = computeBalances(expenses, settlements, memberships);
    const plan = minimiseTransactions(netBalances, usersMap);

    res.json(plan);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
