/**
 * Split Calculator Utility
 * 
 * Purpose:
 * Computes individual expense splits for groups based on the selected split type:
 * 1. EQUAL: Distributes total amount evenly among participants.
 * 2. PERCENTAGE: Distributes based on a specified percentage per user (must total 100%).
 * 3. SHARE: Distributes proportionally based on integer share ratios (e.g., Aisha 2, Rohan 1).
 * 4. UNEQUAL: Distributes based on exact specified amounts per user (must sum to total).
 * 
 * Requirements:
 * - Do NOT use Math.round() for splits on the first N-1 members sequentially.
 * - Apply a remainder-based allocation on the last member so that:
 *   Sum of all amountOwed === expense.amount (in INR).
 * - Ensure amounts are handled precisely and rounded to 2 decimal places.
 */

/**
 * round2
 * Rounds a number to 2 decimal places.
 */
function round2(num) {
  return Math.round(num * 100) / 100;
}

/**
 * computeSplits
 * 
 * @param {number} amount - Total amount of the expense (converted to INR).
 * @param {string} splitType - EQUAL | PERCENTAGE | SHARE | UNEQUAL.
 * @param {Array} participants - List of user IDs participating.
 * @param {Array} splitDetails - List of { userId, value } where value represents percentage, shares, or exact amount.
 * @returns {Array} List of { userId, share, amountOwed } records.
 */
function computeSplits(amount, splitType, participants, splitDetails = []) {
  if (!participants || participants.length === 0) {
    throw new Error('Splits require at least one participant');
  }

  const roundedAmount = round2(amount);
  let computed = [];
  let sumOfFirstNMinus1 = 0;

  switch (splitType) {
    case 'EQUAL': {
      const n = participants.length;
      const exactEach = roundedAmount / n;
      const roundedEach = round2(exactEach);

      for (let i = 0; i < n; i++) {
        const userId = participants[i];
        if (i === n - 1) {
          // Remainder allocated to the last member
          const lastAmount = round2(roundedAmount - sumOfFirstNMinus1);
          computed.push({ userId, share: 1, amountOwed: lastAmount });
        } else {
          computed.push({ userId, share: 1, amountOwed: roundedEach });
          sumOfFirstNMinus1 += roundedEach;
        }
      }
      break;
    }

    case 'PERCENTAGE': {
      // Validate percentages sum up to 100% (within 0.01 margin)
      const totalPct = splitDetails.reduce((sum, d) => sum + Number(d.value), 0);
      if (Math.abs(totalPct - 100) > 0.02) {
        throw new Error(`Percentage splits must sum to 100%, got ${totalPct}%`);
      }

      const n = splitDetails.length;
      for (let i = 0; i < n; i++) {
        const detail = splitDetails[i];
        const pct = Number(detail.value);

        if (i === n - 1) {
          // Remainder allocated to the last member
          const lastAmount = round2(roundedAmount - sumOfFirstNMinus1);
          computed.push({ userId: detail.userId, share: pct, amountOwed: lastAmount });
        } else {
          const userAmount = round2(roundedAmount * (pct / 100));
          computed.push({ userId: detail.userId, share: pct, amountOwed: userAmount });
          sumOfFirstNMinus1 += userAmount;
        }
      }
      break;
    }

    case 'SHARE': {
      const totalShares = splitDetails.reduce((sum, d) => sum + Number(d.value), 0);
      if (totalShares <= 0) {
        throw new Error('Total shares ratio must be greater than 0');
      }

      const n = splitDetails.length;
      for (let i = 0; i < n; i++) {
        const detail = splitDetails[i];
        const shares = Number(detail.value);

        if (i === n - 1) {
          const lastAmount = round2(roundedAmount - sumOfFirstNMinus1);
          computed.push({ userId: detail.userId, share: shares, amountOwed: lastAmount });
        } else {
          const userAmount = round2(roundedAmount * (shares / totalShares));
          computed.push({ userId: detail.userId, share: shares, amountOwed: userAmount });
          sumOfFirstNMinus1 += userAmount;
        }
      }
      break;
    }

    case 'UNEQUAL': {
      // Validate total unequal sums match overall expense amount (within 0.02 margin)
      const totalUnequal = splitDetails.reduce((sum, d) => sum + Number(d.value), 0);
      if (Math.abs(totalUnequal - roundedAmount) > 0.02) {
        throw new Error(`Sum of unequal details (${totalUnequal}) does not match expense amount (${roundedAmount})`);
      }

      const n = splitDetails.length;
      for (let i = 0; i < n; i++) {
        const detail = splitDetails[i];
        const val = Number(detail.value);

        if (i === n - 1) {
          const lastAmount = round2(roundedAmount - sumOfFirstNMinus1);
          computed.push({ userId: detail.userId, share: val, amountOwed: lastAmount });
        } else {
          const roundedVal = round2(val);
          computed.push({ userId: detail.userId, share: val, amountOwed: roundedVal });
          sumOfFirstNMinus1 += roundedVal;
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported split type: ${splitType}`);
  }

  return computed;
}

module.exports = {
  computeSplits,
  round2
};
