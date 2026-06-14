/**
 * Balance Service
 * 
 * Purpose:
 * Computes individual net balances and generates the minimum transaction settlement plan.
 * 
 * Requirements:
 * 1. computeBalances:
 *    - Sum all ExpenseSplits.amountOwed per user (debit).
 *    - Sum all Expenses.amountInr where paidById = user (credit).
 *    - net[user] = paid - owed.
 *    - Settlements adjust net directly: Payer net increases (+amount), Payee net decreases (-amount).
 *    - Membership date filter: Only include an expense in a user's balance if the user
 *      was a member on the expense date (joinedAt <= expense.date AND (leftAt IS NULL OR leftAt >= expense.date)).
 * 2. minimiseTransactions:
 *    - Greedy transaction matching.
 *    - Match largest debtor (negative net) with largest creditor (positive net) to minimize total transfers.
 */

/**
 * computeBalances
 * 
 * @param {Array} expenses - List of group expenses (with splits).
 * @param {Array} settlements - List of group settlements.
 * @param {Array} memberships - List of GroupMembership records.
 * @returns {Object} Mapping of userId -> net balance in INR.
 */
function computeBalances(expenses, settlements, memberships) {
  const net = {};

  // Initialize net balances to 0 for all registered group members
  memberships.forEach((m) => {
    net[m.userId] = 0;
  });

  // Group membership intervals by userId for fast O(1) active check
  const memberMap = {};
  memberships.forEach((m) => {
    if (!memberMap[m.userId]) {
      memberMap[m.userId] = [];
    }
    memberMap[m.userId].push(m);
  });

  /**
   * isUserActiveOnDate
   * 
   * Purpose:
   * Verifies if a user is an active member of the group on the expense date.
   * Matches Rule 3.
   */
  const isUserActiveOnDate = (userId, date) => {
    const list = memberMap[userId];
    if (!list) return false;

    const expenseDate = new Date(date);
    // Normalize hours/offset to ensure date comparisons are clean
    const t = new Date(expenseDate.getFullYear(), expenseDate.getMonth(), expenseDate.getDate()).getTime();

    return list.some((m) => {
      const joined = new Date(m.joinedAt);
      const jt = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate()).getTime();
      if (jt > t) return false; // Date is before user joined

      if (m.leftAt) {
        const left = new Date(m.leftAt);
        const lt = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
        if (lt < t) return false; // Date is after user left
      }
      return true;
    });
  };

  // 1. Process all active expenses
  for (const expense of expenses) {
    const expDate = expense.date;

    // Credit payer if their membership was active on this date
    if (isUserActiveOnDate(expense.paidById, expDate)) {
      net[expense.paidById] = (net[expense.paidById] || 0) + Number(expense.amountInr);
    }

    // Debit each split participant if their membership was active on this date
    for (const split of expense.splits) {
      if (isUserActiveOnDate(split.userId, expDate)) {
        net[split.userId] = (net[split.userId] || 0) - Number(split.amountOwed);
      }
    }
  }

  // 2. Process settlements (adjust net balances directly)
  // Note: Settlements do not need date range checks because they represent explicit transfers
  for (const settlement of settlements) {
    // Payer transfers cash: increases their net credit (reduces debt)
    net[settlement.payerId] = (net[settlement.payerId] || 0) + Number(settlement.amount);
    // Payee receives cash: decreases their net credit (reduces what others owe them)
    net[settlement.payeeId] = (net[settlement.payeeId] || 0) - Number(settlement.amount);
  }

  return net;
}

/**
 * minimiseTransactions (Greedy match)
 * 
 * @param {Object} netBalances - Mapping of userId -> net balance in INR.
 * @param {Object} usersMap - Mapping of userId -> User object containing name.
 * @returns {Array} List of optimized transfers { from, fromName, to, toName, amount }.
 */
function minimiseTransactions(netBalances, usersMap = {}) {
  const transactions = [];

  // Sort creditors: positive net balance (descending)
  const creditors = Object.entries(netBalances)
    .filter(([, v]) => v > 0.01)
    .sort((a, b) => b[1] - a[1])
    .map(([id, val]) => ({ userId: Number(id), val }));

  // Sort debtors: negative net balance (ascending, i.e., largest debt first)
  const debtors = Object.entries(netBalances)
    .filter(([, v]) => v < -0.01)
    .sort((a, b) => a[1] - b[1])
    .map(([id, val]) => ({ userId: Number(id), val: Math.abs(val) }));

  let ci = 0;
  let di = 0;

  // Match creditors and debtors greedily
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci].val;
    const debt = debtors[di].val;
    const transfer = Math.min(credit, debt);

    if (transfer > 0.01) {
      const fromId = debtors[di].userId;
      const toId = creditors[ci].userId;

      transactions.push({
        from: fromId,
        fromName: usersMap[fromId]?.name || `User ${fromId}`,
        to: toId,
        toName: usersMap[toId]?.name || `User ${toId}`,
        amount: Math.round(transfer * 100) / 100
      });
    }

    creditors[ci].val -= transfer;
    debtors[di].val -= transfer;

    // Advance pointers when balance is resolved
    if (creditors[ci].val < 0.01) ci++;
    if (debtors[di].val < 0.01) di++;
  }

  return transactions;
}

module.exports = {
  computeBalances,
  minimiseTransactions
};
