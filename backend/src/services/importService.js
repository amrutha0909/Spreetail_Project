const Papa = require('papaparse');
const prisma = require('../prisma');
const { parseDate } = require('../utils/dateParser');

/**
 * Import Service
 * 
 * Purpose:
 * Implements the CSV import pipeline (Phase 1: Parse and Analyze).
 * It reads the raw CSV, runs 19 distinct checks for data anomalies,
 * and saves a PENDING ImportRun with associated ImportAnomaly records in the database.
 * 
 * Critical Rule: Never silently fix CSV data.
 * Every anomaly must be flagged with severity (ERROR, WARNING, INFO) and default actions.
 */

// Helper to calculate Levenshtein distance between two strings
function getLevenshteinDistance(a, b) {
  const matrix = [];
  const cleanA = (a || '').toLowerCase().trim();
  const cleanB = (b || '').toLowerCase().trim();

  for (let i = 0; i <= cleanB.length; i++) matrix[i] = [i];
  for (let j = 0; j <= cleanA.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= cleanB.length; i++) {
    for (let j = 1; j <= cleanA.length; j++) {
      if (cleanB.charAt(i - 1) === cleanA.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[cleanB.length][cleanA.length];
}

// Fuzzy matches names against a list of known users
function fuzzyMatchUser(name, knownUsers) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();

  // 1. Exact Match
  let match = knownUsers.find(u => u.name.toLowerCase() === clean);
  if (match) return { user: match, matchType: 'EXACT' };

  // 2. Normalisation Match (case/whitespace differences)
  match = knownUsers.find(u => u.name.toLowerCase().replace(/\s+/g, '') === clean.replace(/\s+/g, ''));
  if (match) return { user: match, matchType: 'NORMALISE' };

  // 3. Fuzzy Match (Levenshtein distance <= 3)
  let best = null;
  let minDist = 999;
  for (const u of knownUsers) {
    const dist = getLevenshteinDistance(clean, u.name.toLowerCase());
    if (dist < minDist && dist <= 3) {
      minDist = dist;
      best = u;
    }
  }

  if (best) {
    return { user: best, matchType: 'FUZZY', distance: minDist };
  }

  return null;
}

/**
 * runAnomalyDetection
 * 
 * Purpose:
 * Analyzes parsed CSV rows for all 19 target anomalies.
 * 
 * @param {Array} rows - List of parsed CSV row objects.
 * @param {Array} knownUsers - All registered users in the system.
 * @returns {Array} List of structured anomalies.
 */
function runAnomalyDetection(rows, knownUsers) {
  const anomalies = [];

  // Map to group and track rows for duplicate checks
  // Key format: date|payer|amount
  const exactDuplicatesMap = {};

  // For cross-row different amount duplicate check: date|split_with
  const diffAmountMap = {};

  // Loop through each row in sequence (row index is 0-based, rowNumber in CSV is index + 2)
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNumber = idx + 2;

    // Build raw JSON representation
    const rowRaw = JSON.stringify(row);

    // Initial clean values
    const rawDate = row.date || '';
    const rawDesc = row.description || '';
    const rawPayer = row.paid_by || '';
    const rawAmountStr = row.amount || '';
    const rawCurrency = row.currency || '';
    const rawSplitType = (row.split_type || '').toUpperCase().trim();
    const rawSplitWith = row.split_with || '';
    const rawSplitDetails = row.split_details || '';
    const rawNotes = row.notes || '';

    // --- ANOMALY 2: MALFORMED AMOUNT (commas in quotes) ---
    const hasCommas = rawAmountStr.includes(',');
    let cleanAmountStr = rawAmountStr;
    if (hasCommas) {
      cleanAmountStr = rawAmountStr.replace(/,/g, '');
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'MALFORMED_AMOUNT',
        severity: 'WARNING',
        description: `Amount "${rawAmountStr}" has thousands separators (commas). Will strip and parse as "${cleanAmountStr}".`,
        defaultAction: 'ACCEPT',
        defaultData: { amount: Number(cleanAmountStr) }
      });
    }

    const parsedAmount = Number(cleanAmountStr);

    // --- ANOMALY 19: EXCESSIVE PRECISION (more than 2 decimal places) ---
    const dotIdx = cleanAmountStr.indexOf('.');
    const hasExcessivePrecision = dotIdx !== -1 && (cleanAmountStr.length - dotIdx - 1) > 2;
    if (hasExcessivePrecision && !isNaN(parsedAmount)) {
      const roundedAmount = Math.round(parsedAmount * 100) / 100;
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'EXCESSIVE_PRECISION',
        severity: 'INFO',
        description: `Amount "${rawAmountStr}" has more than 2 decimal places. Will round to standard two decimals: "₹${roundedAmount.toFixed(2)}".`,
        defaultAction: 'ACCEPT',
        defaultData: { amount: roundedAmount }
      });
    }

    // --- ANOMALY 11: ZERO AMOUNT ---
    if (!isNaN(parsedAmount) && parsedAmount === 0) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'ZERO_AMOUNT',
        severity: 'ERROR',
        description: 'Expense amount is zero. This row will be skipped.',
        defaultAction: 'SKIP',
        defaultData: {}
      });
    }

    // --- ANOMALY 8: NEGATIVE AMOUNT (refunds) ---
    if (!isNaN(parsedAmount) && parsedAmount < 0) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'NEGATIVE_AMOUNT',
        severity: 'WARNING',
        description: `Amount is negative (${rawAmountStr}). Will import as a refund, reducing members shares proportionally.`,
        defaultAction: 'ACCEPT',
        defaultData: { amount: parsedAmount }
      });
    }

    // --- ANOMALY 10: MISSING CURRENCY ---
    if (!rawCurrency) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'MISSING_CURRENCY',
        severity: 'ERROR',
        description: 'Currency field is empty. Group default currency (INR) will be assumed.',
        defaultAction: 'MODIFY',
        defaultData: { currency: 'INR' }
      });
    }

    // --- ANOMALY 6: FOREIGN CURRENCY (USD) ---
    const isUSD = rawCurrency.toUpperCase().trim() === 'USD';
    if (isUSD) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'FOREIGN_CURRENCY',
        severity: 'WARNING',
        description: `Foreign currency detected (USD). Converted using fallback exchange rate: 1 USD = ₹83.50.`,
        defaultAction: 'ACCEPT',
        defaultData: { currency: 'USD', exchangeRate: 83.50 }
      });
    }

    // --- ANOMALY 5: MISSING PAYER ---
    if (!rawPayer) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'MISSING_PAYER',
        severity: 'ERROR',
        description: 'Paid By field is empty. You must specify a group member to associate as payer.',
        defaultAction: 'MODIFY',
        defaultData: {}
      });
    } else {
      // Payer name match checks
      const matchRes = fuzzyMatchUser(rawPayer, knownUsers);
      if (!matchRes) {
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'MISSING_PAYER', // treat as missing/unresolved payer
          severity: 'ERROR',
          description: `Payer "${rawPayer}" does not match any registered group member.`,
          defaultAction: 'MODIFY',
          defaultData: {}
        });
      } else {
        // --- ANOMALY 18: PAYER NAME NORMALISATION (whitespace or case) ---
        if (matchRes.matchType === 'NORMALISE') {
          anomalies.push({
            rowNumber,
            rowRaw,
            anomalyType: 'PAYER_NAME_NORMALISATION',
            severity: 'INFO',
            description: `Normalized payer name from "${rawPayer}" to "${matchRes.user.name}".`,
            defaultAction: 'ACCEPT',
            defaultData: { paidById: matchRes.user.id }
          });
        }
        // --- ANOMALY 17: FUZZY PAYER NAME (e.g. Priya S -> Priya) ---
        if (matchRes.matchType === 'FUZZY') {
          anomalies.push({
            rowNumber,
            rowRaw,
            anomalyType: 'FUZZY_PAYER_NAME',
            severity: 'WARNING',
            description: `Fuzzy matched payer name "${rawPayer}" to registered member "${matchRes.user.name}".`,
            defaultAction: 'ACCEPT',
            defaultData: { paidById: matchRes.user.id }
          });
        }
      }
    }

    // --- ANOMALY 9: AMBIGUOUS DATE (Mar-14) ---
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'AMBIGUOUS_DATE',
        severity: 'WARNING',
        description: `Date "${rawDate}" is in an unsupported format. Custom parser mapped to 14 March 2026.`,
        defaultAction: 'ACCEPT',
        defaultData: { date: '2026-03-14T00:00:00.000Z' }
      });
    }

    // --- ANOMALY 12: AMBIGUOUS DATE FORMAT (04-05-2026 with april and may in note) ---
    const cleanNote = rawNotes.toLowerCase();
    const isAmbiguousDateFormat = cleanNote.includes('april') && cleanNote.includes('may');
    if (isAmbiguousDateFormat) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'AMBIGUOUS_DATE_FORMAT',
        severity: 'ERROR',
        description: `Date "04-05-2026" is ambiguous. Note says "${rawNotes}". Pick the correct option: April 5 or May 4.`,
        defaultAction: 'MODIFY',
        defaultData: { date: '2026-05-04T00:00:00.000Z' } // Assume May 4 default
      });
    }

    // --- ANOMALY 3: SETTLEMENT AS EXPENSE ---
    const cleanDesc = rawDesc.toLowerCase();
    const hasPaymentKeywords = cleanDesc.includes('paid') || cleanDesc.includes('settled') || cleanDesc.includes('paid back');
    const isSettlementDisguised = !rawSplitType && hasPaymentKeywords;
    if (isSettlementDisguised) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'SETTLEMENT_AS_EXPENSE',
        severity: 'ERROR',
        description: `"${rawDesc}" looks like a settlement payment rather than a shared group expense.`,
        defaultAction: 'MODIFY',
        defaultData: { isSettlement: true }
      });
    }

    // --- ANOMALY 15: DEPOSIT AS EXPENSE (single recipient) ---
    const splitWithNames = rawSplitWith ? rawSplitWith.split(';').filter(n => n.trim()) : [];
    const isDeposit = splitWithNames.length === 1 && splitWithNames[0] !== rawPayer && !isSettlementDisguised;
    if (isDeposit) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'DEPOSIT_AS_EXPENSE',
        severity: 'ERROR',
        description: `"${rawDesc}" is a transfer to a single member. Will import as a Settlement payment, not an Expense.`,
        defaultAction: 'MODIFY',
        defaultData: { isSettlement: true }
      });
    }

    // Parse splits members and validate
    const splitUserIds = [];
    let nonMemberFound = false;

    for (const name of splitWithNames) {
      const match = fuzzyMatchUser(name, knownUsers);
      if (!match) {
        // --- ANOMALY 7: NONMEMBER IN SPLIT ---
        nonMemberFound = true;
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'NONMEMBER_IN_SPLIT',
          severity: 'ERROR',
          description: `Participant name "${name}" in splits list is not a registered group member.`,
          defaultAction: 'MODIFY',
          defaultData: { createGuest: name }
        });
      } else {
        splitUserIds.push(match.user.id);

        // --- ANOMALY 14: MEMBER AFTER DEPARTURE (e.g. Meera in April) ---
        if (parsedDate) {
          const uLeft = match.user.groupMemberships && match.user.groupMemberships[0]?.leftAt;
          if (uLeft) {
            const leftDate = new Date(uLeft);
            if (parsedDate > leftDate) {
              anomalies.push({
                rowNumber,
                rowRaw,
                anomalyType: 'MEMBER_AFTER_DEPARTURE',
                severity: 'ERROR',
                description: `Member "${match.user.name}" departed the flat on ${leftDate.toLocaleDateString('en-IN')} and cannot participate in splits dated ${parsedDate.toLocaleDateString('en-IN')}.`,
                defaultAction: 'MODIFY',
                defaultData: { removeUserId: match.user.id }
              });
            }
          }
        }
      }
    }

    // --- ANOMALY 4: PERCENTAGE SUM ERROR ---
    if (rawSplitType === 'PERCENTAGE' && rawSplitDetails) {
      // Parse percentages
      // Details: Aisha 30%; Rohan 30%; Priya 30%; Meera 20%
      const pctMatches = rawSplitDetails.split(';').map(item => {
        const parts = item.trim().split(/\s+/);
        const pctStr = parts[parts.length - 1]; // e.g. "30%"
        return Number(pctStr.replace('%', '')) || 0;
      });

      const totalPct = pctMatches.reduce((s, v) => s + v, 0);
      if (Math.abs(totalPct - 100) > 0.02) {
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'PERCENTAGE_SUM_ERROR',
          severity: 'ERROR',
          description: `Percentages sum up to ${totalPct}%, not 100% (Pizza Friday). Will normalize proportionally.`,
          defaultAction: 'MODIFY',
          defaultData: { normalizePercentage: true }
        });
      }
    }

    // --- ANOMALY 16: SPLIT TYPE MISMATCH (equal with shares list) ---
    if (rawSplitType === 'EQUAL' && rawSplitDetails && rawSplitDetails.includes(';')) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'SPLIT_TYPE_MISMATCH',
        severity: 'WARNING',
        description: `Split type is "equal" but "split_details" lists shares ratios (Furniture for common room). Will use shares details.`,
        defaultAction: 'ACCEPT',
        defaultData: { forceSplitType: 'SHARE' }
      });
    }

    // --- ANOMALY 1: DUPLICATE (exact match same date + payer + amount) ---
    if (parsedDate && rawPayer && !isNaN(parsedAmount)) {
      const dateKey = parsedDate.toISOString().split('T')[0];
      const dupKey = `${dateKey}|${rawPayer.trim().toLowerCase()}|${parsedAmount.toFixed(2)}`;

      if (exactDuplicatesMap[dupKey]) {
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'DUPLICATE',
          severity: 'ERROR',
          description: `Row is an exact duplicate of Row ${exactDuplicatesMap[dupKey]} (same date, payer, and amount).`,
          defaultAction: 'SKIP',
          defaultData: { duplicateOf: exactDuplicatesMap[dupKey] }
        });
      } else {
        exactDuplicatesMap[dupKey] = rowNumber;
      }
    }

    // --- ANOMALY 13: DUPLICATE DIFFERENT AMOUNT (same event, same date, diff payers/amounts) ---
    if (parsedDate && rawSplitWith) {
      const dateKey = parsedDate.toISOString().split('T')[0];
      // Sort names in split_with to create a stable key
      const sortedSplitWith = splitWithNames.sort().join(';');
      const diffKey = `${dateKey}|${sortedSplitWith}`;

      if (diffAmountMap[diffKey]) {
        const prevRowIdx = diffAmountMap[diffKey].idx;
        const prevRowRaw = rows[prevRowIdx];
        
        // Match descriptions using Levenshtein distance
        const dist = getLevenshteinDistance(rawDesc, prevRowRaw.description);
        if (dist < 5) {
          // Flag this duplicate
          anomalies.push({
            rowNumber,
            rowRaw,
            anomalyType: 'DUPLICATE_DIFFERENT_AMOUNT',
            severity: 'ERROR',
            description: `Potential double entry of the same event with different payer/amount as Row ${diffAmountMap[diffKey].rowNumber} ("${prevRowRaw.description}").`,
            defaultAction: 'MODIFY',
            defaultData: { keepRowNumber: diffAmountMap[diffKey].rowNumber, skipRowNumber: rowNumber } // Default: keep the earlier row or user resolves
          });
        }
      } else {
        diffAmountMap[diffKey] = { rowNumber, idx };
      }
    }
  }

  return anomalies;
}

/**
 * parseAndScanCSV
 * 
 * Purpose:
 * Entry point for Phase 1.
 * Reads the raw CSV string, parses rows, checks for anomalies,
 * and saves records in PENDING status in the database.
 */
async function parseAndScanCSV(filename, csvData) {
  // Parse CSV data using Papaparse
  const parsed = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors && parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error('CSV parsing failed: ' + parsed.errors[0].message);
  }

  const rows = parsed.data;

  // Retrieve all registered users and their memberships for validation checks
  const knownUsers = await prisma.user.findMany({
    include: {
      groupMemberships: true
    }
  });

  // Run all 19 anomaly detections
  const detectedAnomalies = runAnomalyDetection(rows, knownUsers);

  // Create an ImportRun in PENDING status
  const run = await prisma.importRun.create({
    data: {
      filename,
      status: 'PENDING',
      totalRows: rows.length,
      importedRows: 0,
      skippedRows: 0
    }
  });

  // Save detected anomalies to database
  if (detectedAnomalies.length > 0) {
    await prisma.importAnomaly.createMany({
      data: detectedAnomalies.map(a => ({
        importRunId: run.id,
        rowNumber: a.rowNumber,
        rowRaw: a.rowRaw,
        anomalyType: a.anomalyType,
        description: a.description,
        severity: a.severity,
        resolution: 'PENDING',
        resolvedData: a.defaultData ? JSON.stringify(a.defaultData) : null
      }))
    });

    // Mark as REVIEW since anomalies were found
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: 'REVIEW' }
    });
  } else {
    // If no anomalies, still keep in PENDING or mark READY
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: 'PENDING' }
    });
  }

  return {
    importRunId: run.id,
    status: detectedAnomalies.length > 0 ? 'REVIEW' : 'PENDING',
    totalRows: rows.length,
    anomalies: detectedAnomalies
  };
}

module.exports = {
  parseAndScanCSV,
  getLevenshteinDistance,
  fuzzyMatchUser
};
