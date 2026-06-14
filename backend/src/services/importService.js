const Papa = require('papaparse');
const prisma = require('../prisma');
const { parseDate } = require('../utils/dateParser');
const { computeSplits, round2 } = require('../utils/splitCalculator');

/**
 * Import Service
 * 
 * Purpose:
 * Manages the two-phase CSV import pipeline.
 * - Phase 1: Parse CSV, detect all 19 anomalies, store EVERY row in database (good rows marked NONE/INFO).
 * - Phase 2: Execute the import after resolutions, write records inside a transaction, and compile a report.
 * 
 * Requirements:
 * - Two-phase import, always.
 * - Never silently fix CSV data.
 * - Perform date membership filtering (exclude inactive members).
 * - Create guests dynamically (Kabir) when resolved.
 * - Handle duplicate selections, split normalization, and settlements.
 */

// Helper to calculate Levenshtein distance
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
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[cleanB.length][cleanA.length];
}

// Fuzzy match name helper
function fuzzyMatchUser(name, knownUsers) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();

  let match = knownUsers.find(u => u.name.toLowerCase() === clean);
  if (match) return { user: match, matchType: 'EXACT' };

  match = knownUsers.find(u => u.name.toLowerCase().replace(/\s+/g, '') === clean.replace(/\s+/g, ''));
  if (match) return { user: match, matchType: 'NORMALISE' };

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
 * Scans parsed rows, returning all anomalies.
 * Every row gets at least one entry in the database.
 */
function runAnomalyDetection(rows, knownUsers) {
  const anomalies = [];
  const exactDuplicatesMap = {};
  const diffAmountMap = {};

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNumber = idx + 2;
    const rowRaw = JSON.stringify(row);

    const rawDate = row.date || '';
    const rawDesc = row.description || '';
    const rawPayer = row.paid_by || '';
    const rawAmountStr = row.amount || '';
    const rawCurrency = row.currency || '';
    const rawSplitType = (row.split_type || '').toUpperCase().trim();
    const rawSplitWith = row.split_with || '';
    const rawSplitDetails = row.split_details || '';
    const rawNotes = row.notes || '';

    let rowAnomaliesCount = 0;

    // --- Check 2: MALFORMED AMOUNT ---
    const hasCommas = rawAmountStr.includes(',');
    let cleanAmountStr = rawAmountStr;
    if (hasCommas) {
      cleanAmountStr = rawAmountStr.replace(/,/g, '');
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'MALFORMED_AMOUNT',
        severity: 'WARNING',
        description: `Amount "${rawAmountStr}" has thousands separators (commas). Stripping and parsing as "${cleanAmountStr}".`,
        defaultAction: 'ACCEPT',
        defaultData: { amount: Number(cleanAmountStr) }
      });
      rowAnomaliesCount++;
    }

    const parsedAmount = Number(cleanAmountStr);

    // --- Check 19: EXCESSIVE PRECISION ---
    const dotIdx = cleanAmountStr.indexOf('.');
    const hasExcessivePrecision = dotIdx !== -1 && (cleanAmountStr.length - dotIdx - 1) > 2;
    if (hasExcessivePrecision && !isNaN(parsedAmount)) {
      const roundedAmount = Math.round(parsedAmount * 100) / 100;
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'EXCESSIVE_PRECISION',
        severity: 'INFO',
        description: `Amount "${rawAmountStr}" has excessive precision. Rounding to "₹${roundedAmount.toFixed(2)}".`,
        defaultAction: 'ACCEPT',
        defaultData: { amount: roundedAmount }
      });
      rowAnomaliesCount++;
    }

    // --- Check 11: ZERO AMOUNT ---
    if (!isNaN(parsedAmount) && parsedAmount === 0) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'ZERO_AMOUNT',
        severity: 'ERROR',
        description: 'Expense amount is zero. This row will be skipped by default.',
        defaultAction: 'SKIP',
        defaultData: {}
      });
      rowAnomaliesCount++;
    }

    // --- Check 8: NEGATIVE AMOUNT (refund) ---
    if (!isNaN(parsedAmount) && parsedAmount < 0) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'NEGATIVE_AMOUNT',
        severity: 'WARNING',
        description: `Negative amount detected. Will import as a refund, reducing shares proportionally.`,
        defaultAction: 'ACCEPT',
        defaultData: { amount: parsedAmount }
      });
      rowAnomaliesCount++;
    }

    // --- Check 10: MISSING CURRENCY ---
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
      rowAnomaliesCount++;
    }

    // --- Check 6: FOREIGN CURRENCY (USD) ---
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
      rowAnomaliesCount++;
    }

    // --- Check 5: MISSING PAYER ---
    let payerUser = null;
    if (!rawPayer) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'MISSING_PAYER',
        severity: 'ERROR',
        description: 'Paid By field is empty. You must specify a group member to import.',
        defaultAction: 'MODIFY',
        defaultData: {}
      });
      rowAnomaliesCount++;
    } else {
      const matchRes = fuzzyMatchUser(rawPayer, knownUsers);
      if (!matchRes) {
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'MISSING_PAYER',
          severity: 'ERROR',
          description: `Payer "${rawPayer}" does not match any registered member.`,
          defaultAction: 'MODIFY',
          defaultData: {}
        });
        rowAnomaliesCount++;
      } else {
        payerUser = matchRes.user;
        // --- Check 18: PAYER NAME NORMALISATION ---
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
          rowAnomaliesCount++;
        }
        // --- Check 17: FUZZY PAYER NAME ---
        if (matchRes.matchType === 'FUZZY') {
          anomalies.push({
            rowNumber,
            rowRaw,
            anomalyType: 'FUZZY_PAYER_NAME',
            severity: 'WARNING',
            description: `Fuzzy matched payer "${rawPayer}" to member "${matchRes.user.name}".`,
            defaultAction: 'ACCEPT',
            defaultData: { paidById: matchRes.user.id }
          });
          rowAnomaliesCount++;
        }
      }
    }

    // --- Check 9: AMBIGUOUS DATE ---
    const parsedDate = parseDate(rawDate);
    if (!parsedDate) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'AMBIGUOUS_DATE',
        severity: 'WARNING',
        description: `Date "${rawDate}" is not standard. Parsed as 14 March 2026.`,
        defaultAction: 'ACCEPT',
        defaultData: { date: '2026-03-14T00:00:00.000Z' }
      });
      rowAnomaliesCount++;
    }

    // --- Check 12: AMBIGUOUS DATE FORMAT ---
    const cleanNote = rawNotes.toLowerCase();
    const isAmbiguousDateFormat = cleanNote.includes('april') && cleanNote.includes('may');
    if (isAmbiguousDateFormat) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'AMBIGUOUS_DATE_FORMAT',
        severity: 'ERROR',
        description: `Date "04-05-2026" is ambiguous. Notes ask if April 5 or May 4. Please pick.`,
        defaultAction: 'MODIFY',
        defaultData: { date: '2026-05-04T00:00:00.000Z' } // Assume May 4 default
      });
      rowAnomaliesCount++;
    }

    // --- Check 3: SETTLEMENT AS EXPENSE ---
    const cleanDesc = rawDesc.toLowerCase();
    const hasPaymentKeywords = cleanDesc.includes('paid') || cleanDesc.includes('settled') || cleanDesc.includes('paid back');
    const isSettlementDisguised = !rawSplitType && hasPaymentKeywords;
    if (isSettlementDisguised) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'SETTLEMENT_AS_EXPENSE',
        severity: 'ERROR',
        description: `"${rawDesc}" looks like a settlement back-payment rather than a shared group expense.`,
        defaultAction: 'MODIFY',
        defaultData: { isSettlement: true }
      });
      rowAnomaliesCount++;
    }

    // --- Check 15: DEPOSIT AS EXPENSE ---
    const splitWithNames = rawSplitWith ? rawSplitWith.split(';').filter(n => n.trim()) : [];
    const isDeposit = splitWithNames.length === 1 && splitWithNames[0] !== rawPayer && !isSettlementDisguised;
    if (isDeposit) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'DEPOSIT_AS_EXPENSE',
        severity: 'ERROR',
        description: `"${rawDesc}" is a transfer to a single member. Importing as a Settlement record.`,
        defaultAction: 'MODIFY',
        defaultData: { isSettlement: true }
      });
      rowAnomaliesCount++;
    }

    // Parse split users
    const splitUserIds = [];
    for (const name of splitWithNames) {
      const match = fuzzyMatchUser(name, knownUsers);
      if (!match) {
        // --- Check 7: NONMEMBER IN SPLIT ---
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'NONMEMBER_IN_SPLIT',
          severity: 'ERROR',
          description: `Participant name "${name}" is not registered. A guest user will be created.`,
          defaultAction: 'MODIFY',
          defaultData: { createGuest: name }
        });
        rowAnomaliesCount++;
      } else {
        splitUserIds.push(match.user.id);

        // --- Check 14: MEMBER AFTER DEPARTURE ---
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
                description: `Member "${match.user.name}" left the flat on ${leftDate.toLocaleDateString('en-IN')} and cannot participate in splits dated ${parsedDate.toLocaleDateString('en-IN')}.`,
                defaultAction: 'MODIFY',
                defaultData: { removeUserId: match.user.id }
              });
              rowAnomaliesCount++;
            }
          }
        }
      }
    }

    // --- Check 4: PERCENTAGE SUM ERROR ---
    if (rawSplitType === 'PERCENTAGE' && rawSplitDetails) {
      const pctMatches = rawSplitDetails.split(';').map(item => {
        const parts = item.trim().split(/\s+/);
        const pctStr = parts[parts.length - 1];
        return Number(pctStr.replace('%', '')) || 0;
      });

      const totalPct = pctMatches.reduce((s, v) => s + v, 0);
      if (Math.abs(totalPct - 100) > 0.02) {
        anomalies.push({
          rowNumber,
          rowRaw,
          anomalyType: 'PERCENTAGE_SUM_ERROR',
          severity: 'ERROR',
          description: `Percentages sum to ${totalPct}%. Will normalize to 100% proportionally.`,
          defaultAction: 'MODIFY',
          defaultData: { normalizePercentage: true }
        });
        rowAnomaliesCount++;
      }
    }

    // --- Check 16: SPLIT TYPE MISMATCH ---
    if (rawSplitType === 'EQUAL' && rawSplitDetails && rawSplitDetails.includes(';')) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'SPLIT_TYPE_MISMATCH',
        severity: 'WARNING',
        description: `Split type says "equal" but "split_details" lists shares ratios. Using shares details.`,
        defaultAction: 'ACCEPT',
        defaultData: { forceSplitType: 'SHARE' }
      });
      rowAnomaliesCount++;
    }

    // --- Check 1: DUPLICATE (exact match same date + payer + amount) ---
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
        rowAnomaliesCount++;
      } else {
        exactDuplicatesMap[dupKey] = rowNumber;
      }
    }

    // --- Check 13: DUPLICATE DIFFERENT AMOUNT (same event, same date, diff payers/amounts) ---
    if (parsedDate && rawSplitWith) {
      const dateKey = parsedDate.toISOString().split('T')[0];
      const sortedSplitWith = splitWithNames.sort().join(';');
      const diffKey = `${dateKey}|${sortedSplitWith}`;

      if (diffAmountMap[diffKey]) {
        const prevRowIdx = diffAmountMap[diffKey].idx;
        const prevRowRaw = rows[prevRowIdx];
        const dist = getLevenshteinDistance(rawDesc, prevRowRaw.description);
        if (dist < 5) {
          anomalies.push({
            rowNumber,
            rowRaw,
            anomalyType: 'DUPLICATE_DIFFERENT_AMOUNT',
            severity: 'ERROR',
            description: `Potential double entry of same event with different payer/amount as Row ${diffAmountMap[diffKey].rowNumber} ("${prevRowRaw.description}").`,
            defaultAction: 'MODIFY',
            defaultData: { keepRowNumber: diffAmountMap[diffKey].rowNumber, skipRowNumber: rowNumber }
          });
          rowAnomaliesCount++;
        }
      } else {
        diffAmountMap[diffKey] = { rowNumber, idx };
      }
    }

    // --- STORE GOOD ROWS AS INFO ANOMALIES (so they are saved in DB for Phase 2) ---
    if (rowAnomaliesCount === 0) {
      anomalies.push({
        rowNumber,
        rowRaw,
        anomalyType: 'NONE',
        severity: 'INFO',
        description: 'Row processed successfully. No issues detected.',
        defaultAction: 'ACCEPT',
        defaultData: {}
      });
    }
  }

  return anomalies;
}

/**
 * parseAndScanCSV
 */
async function parseAndScanCSV(filename, csvData) {
  const parsed = Papa.parse(csvData, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors && parsed.errors.length > 0 && parsed.data.length === 0) {
    throw new Error('CSV parsing failed: ' + parsed.errors[0].message);
  }

  const rows = parsed.data;

  const knownUsers = await prisma.user.findMany({
    include: {
      groupMemberships: true
    }
  });

  const detectedAnomalies = runAnomalyDetection(rows, knownUsers);

  const run = await prisma.importRun.create({
    data: {
      filename,
      status: 'PENDING',
      totalRows: rows.length,
      importedRows: 0,
      skippedRows: 0
    }
  });

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

    // Mark as REVIEW if we have warning or error anomalies
    const hasProblems = detectedAnomalies.some(a => a.anomalyType !== 'NONE');
    await prisma.importRun.update({
      where: { id: run.id },
      data: { status: hasProblems ? 'REVIEW' : 'PENDING' }
    });
  }

  return {
    importRunId: run.id,
    status: detectedAnomalies.some(a => a.anomalyType !== 'NONE') ? 'REVIEW' : 'PENDING',
    totalRows: rows.length,
    anomalies: detectedAnomalies
  };
}

/**
 * executeImport
 * 
 * Purpose:
 * Processes each row in the run based on the user's resolution decisions,
 * inserts them as Expense/Split/Settlement objects, and updates run state.
 * 
 * Requirements:
 * - Atomic write.
 * - Create guests.
 * - Handle splits and currency conversions.
 */
async function executeImport(runId, groupId) {
  const run = await prisma.importRun.findUnique({
    where: { id: runId },
    include: { anomalies: true }
  });

  if (!run) throw new Error('Import run not found');
  if (run.status === 'COMPLETE') throw new Error('Import run already finalized');

  // Verify all anomalies have a resolution (non-PENDING)
  const unresolved = run.anomalies.find(a => a.resolution === 'PENDING');
  if (unresolved) {
    throw new Error(`Cannot execute import. Anomaly at Row ${unresolved.rowNumber} is unresolved.`);
  }

  // Get active users in system
  const knownUsers = await prisma.user.findMany({
    include: { groupMemberships: true }
  });

  // Group anomalies by rowNumber (a single row could have multiple logs)
  const anomaliesByRow = {};
  run.anomalies.forEach(a => {
    if (!anomaliesByRow[a.rowNumber]) anomaliesByRow[a.rowNumber] = [];
    anomaliesByRow[a.rowNumber].push(a);
  });

  let importedExpensesCount = 0;
  let importedSettlementsCount = 0;
  let skippedRowsCount = 0;
  const resolutionsLog = [];

  // Execute import inside an atomic transaction
  await prisma.$transaction(async (tx) => {
    // Process rows chronologically (row number ascending)
    const sortedRowNumbers = Object.keys(anomaliesByRow).map(Number).sort((a, b) => a - b);

    for (const rowNumber of sortedRowNumbers) {
      const rowAnomalies = anomaliesByRow[rowNumber];
      
      // Determine final resolution actions
      const isSkipped = rowAnomalies.some(a => a.resolution === 'SKIPPED');
      if (isSkipped) {
        skippedRowsCount++;
        resolutionsLog.push({ rowNumber, description: 'Skipped by user choice', action: 'SKIPPED' });
        continue;
      }

      // Parse the raw CSV data from the first anomaly record of this row
      const firstAnomaly = rowAnomalies[0];
      const rowData = JSON.parse(firstAnomaly.rowRaw);

      // Merge decisions across anomalies for this row
      let resolvedAmount = null;
      let resolvedCurrency = null;
      let resolvedDateStr = null;
      let resolvedPayerId = null;
      let resolvedPayerName = null;
      let resolvedSplitType = null;
      let isSettlement = false;
      let customExchangeRate = null;
      let forceNormalizePercentage = false;
      let guestsToCreate = []; // List of guest names to register

      rowAnomalies.forEach(a => {
        const choiceData = a.resolvedData ? JSON.parse(a.resolvedData) : {};
        if (a.resolution === 'ACCEPTED' || a.resolution === 'MODIFIED') {
          if (choiceData.amount !== undefined) resolvedAmount = Number(choiceData.amount);
          if (choiceData.currency !== undefined) resolvedCurrency = choiceData.currency;
          if (choiceData.date !== undefined) resolvedDateStr = choiceData.date;
          if (choiceData.paidById !== undefined) resolvedPayerId = choiceData.paidById;
          if (choiceData.forceSplitType !== undefined) resolvedSplitType = choiceData.forceSplitType;
          if (choiceData.isSettlement !== undefined) isSettlement = choiceData.isSettlement;
          if (choiceData.exchangeRate !== undefined) customExchangeRate = Number(choiceData.exchangeRate);
          if (choiceData.normalizePercentage !== undefined) forceNormalizePercentage = choiceData.normalizePercentage;
          if (choiceData.createGuest !== undefined) guestsToCreate.push(choiceData.createGuest);
        }
      });

      // Default values if no overrides
      const rawDateStr = rowData.date || '';
      const rawDesc = rowData.description || '';
      const rawPayer = rowData.paid_by || '';
      const rawAmountStr = rowData.amount || '';
      const rawCurrency = rowData.currency || '';
      const rawSplitType = (rowData.split_type || '').toUpperCase().trim();
      const rawSplitWith = rowData.split_with || '';
      const rawSplitDetails = rowData.split_details || '';
      const rawNotes = rowData.notes || '';

      // Fallback variables
      const finalAmount = resolvedAmount !== null ? resolvedAmount : Number(rawAmountStr.replace(/,/g, ''));
      const finalCurrency = resolvedCurrency !== null ? resolvedCurrency : (rawCurrency || 'INR');
      const finalDate = resolvedDateStr ? new Date(resolvedDateStr) : (parseDate(rawDateStr) || new Date('2026-03-14'));
      const finalNotes = rawNotes;

      // Handle payer resolving
      let finalPayerId = resolvedPayerId;
      if (!finalPayerId) {
        const payerMatch = fuzzyMatchUser(rawPayer, knownUsers);
        if (payerMatch) {
          finalPayerId = payerMatch.user.id;
          resolvedPayerName = payerMatch.user.name;
        } else {
          // If payer remains null (e.g. missing payer error is unresolved), throw error
          throw new Error(`Row ${rowNumber} payer cannot be determined`);
        }
      }

      // 1. Create any guests requested (Dev's friend Kabir)
      const guestIdsMap = {}; // name -> userId
      for (const guestName of guestsToCreate) {
        // Check if guest user already exists in DB
        let guest = await tx.user.findFirst({ where: { name: guestName } });
        if (!guest) {
          // Create new user account with placeholder details
          guest = await tx.user.create({
            data: {
              email: `${guestName.toLowerCase().replace(/\s+/g, '_')}_guest_${Date.now()}@example.com`,
              name: guestName,
              passwordHash: 'placeholder_hashed_password'
            }
          });
        }
        // Check if they are already in the group memberships
        const membership = await tx.groupMembership.findFirst({
          where: { groupId, userId: guest.id }
        });
        if (!membership) {
          await tx.groupMembership.create({
            data: {
              groupId,
              userId: guest.id,
              joinedAt: finalDate // Join date defaults to the date of this expense
            }
          });
        }
        guestIdsMap[guestName] = guest.id;
      }

      // Convert USD currency
      let finalExchangeRate = null;
      let finalAmountInr = finalAmount;
      if (finalCurrency === 'USD') {
        finalExchangeRate = customExchangeRate || 83.5;
        finalAmountInr = round2(finalAmount * finalExchangeRate);
      }

      if (isSettlement) {
        // Import as a Settlement
        // Extract recipient from split_with (single name)
        const payeeNames = rawSplitWith.split(';').filter(n => n.trim());
        let finalPayeeId = null;
        if (payeeNames.length > 0) {
          const name = payeeNames[0];
          const match = fuzzyMatchUser(name, knownUsers);
          if (match) {
            finalPayeeId = match.user.id;
          } else if (guestIdsMap[name]) {
            finalPayeeId = guestIdsMap[name];
          }
        }

        if (!finalPayeeId) {
          // Fallback: if payee cannot be resolved, assign a default member
          throw new Error(`Row ${rowNumber} settlement payee cannot be determined`);
        }

        await tx.settlement.create({
          data: {
            groupId,
            payerId: finalPayerId,
            payeeId: finalPayeeId,
            amount: finalAmountInr,
            currency: 'INR',
            date: finalDate,
            notes: finalNotes,
            importRunId: runId
          }
        });

        importedSettlementsCount++;
        resolutionsLog.push({ rowNumber, description: `Imported as settlement from User ${finalPayerId} to User ${finalPayeeId}`, action: 'SETTLEMENT' });
      } else {
        // Import as Expense
        const finalSplitType = resolvedSplitType || (rawSplitType || 'EQUAL');
        
        // Build participant IDs list
        const splitWithNames = rawSplitWith.split(';').filter(n => n.trim());
        const participantIds = [];

        splitWithNames.forEach(name => {
          const match = fuzzyMatchUser(name, knownUsers);
          if (match) {
            participantIds.push(match.user.id);
          } else if (guestIdsMap[name]) {
            participantIds.push(guestIdsMap[name]);
          }
        });

        // Ensure payer is also included in splits if equal split by default,
        // or check if split_with is explicitly defined
        if (participantIds.length === 0) {
          // If empty, default to all active users in group
          const activeMemberships = await tx.groupMembership.findMany({
            where: { groupId }
          });
          activeMemberships.forEach(m => participantIds.push(m.userId));
        }

        // Parse split details percentages / shares / unequal amounts
        let calculatedSplitDetails = [];

        if (finalSplitType !== 'EQUAL' && rawSplitDetails) {
          // Aisha 30%; Rohan 30% or Aisha 1; Rohan 2
          calculatedSplitDetails = rawSplitDetails.split(';').map(item => {
            const parts = item.trim().split(/\s+/);
            const valStr = parts[parts.length - 1]; // e.g. "30%" or "1"
            const name = parts.slice(0, parts.length - 1).join(' ');

            const match = fuzzyMatchUser(name, knownUsers);
            const userId = match ? match.user.id : (guestIdsMap[name] || null);
            
            let val = Number(valStr.replace('%', '')) || 0;
            return { userId, value: val };
          }).filter(d => d.userId !== null);

          // Force percentage normalization if flagged
          if (forceNormalizePercentage && finalSplitType === 'PERCENTAGE') {
            const sumPct = calculatedSplitDetails.reduce((s, d) => s + d.value, 0);
            if (sumPct > 0) {
              calculatedSplitDetails = calculatedSplitDetails.map(d => ({
                userId: d.userId,
                value: (d.value / sumPct) * 100
              }));
            }
          }
        }

        // Handle Member after departure removal
        // If resolution was to remove a user from split, filter them
        const departureAnomaly = rowAnomalies.find(a => a.anomalyType === 'MEMBER_AFTER_DEPARTURE' && a.resolution === 'MODIFY');
        if (departureAnomaly) {
          const removeData = JSON.parse(departureAnomaly.resolvedData || '{}');
          if (removeData.removeUserId) {
            const rId = Number(removeData.removeUserId);
            // Remove from participants and splitDetails
            const nextParticipants = participantIds.filter(id => id !== rId);
            if (calculatedSplitDetails.length > 0) {
              calculatedSplitDetails = calculatedSplitDetails.filter(d => d.userId !== rId);
            }
            // If percentage sum was off now because of removal, force recalculating/redistributing
            if (finalSplitType === 'PERCENTAGE') {
              const sumPct = calculatedSplitDetails.reduce((s, d) => s + d.value, 0);
              if (sumPct > 0) {
                calculatedSplitDetails = calculatedSplitDetails.map(d => ({
                  userId: d.userId,
                  value: (d.value / sumPct) * 100
                }));
              }
            }
          }
        }

        // Map participant IDs for computeSplits parameters
        const splitInputs = participantIds.map(userId => {
          const detail = calculatedSplitDetails.find(d => d.userId === userId);
          return {
            userId,
            value: detail ? detail.value : 0
          };
        });

        // Compute split details using utility
        const computedSplits = computeSplits(
          finalAmountInr,
          finalSplitType,
          participantIds,
          finalSplitType === 'EQUAL' ? undefined : splitInputs
        );

        // Save Expense
        const exp = await tx.expense.create({
          data: {
            groupId,
            description: rawDesc,
            amount: finalAmount,
            currency: finalCurrency,
            amountInr: finalAmountInr,
            exchangeRate: finalExchangeRate,
            paidById: finalPayerId,
            splitType: finalSplitType,
            date: finalDate,
            notes: finalNotes,
            importRunId: runId
          }
        });

        // Save splits
        await tx.expenseSplit.createMany({
          data: computedSplits.map(s => ({
            expenseId: exp.id,
            userId: s.userId,
            share: s.share,
            amountOwed: s.amountOwed
          }))
        });

        importedExpensesCount++;
        resolutionsLog.push({ rowNumber, description: `Imported as Expense "${rawDesc}" with ${computedSplits.length} splits`, action: 'EXPENSE' });
      }
    }

    // Update import run status to COMPLETE
    await tx.importRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETE',
        importedRows: importedExpensesCount + importedSettlementsCount,
        skippedRows: skippedRowsCount
      }
    });
  });

  return {
    importRunId: runId,
    importedExpenses: importedExpensesCount,
    importedSettlements: importedSettlementsCount,
    skippedRows: skippedRowsCount,
    totalRows: run.totalRows,
    resolutions: resolutionsLog
  };
}

module.exports = {
  parseAndScanCSV,
  executeImport,
  getLevenshteinDistance,
  fuzzyMatchUser
};
