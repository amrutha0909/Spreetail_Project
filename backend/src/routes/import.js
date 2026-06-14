const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { parseAndScanCSV, executeImport } = require('../services/importService');

// Apply auth middleware to all import routes
router.use(authMiddleware);

/**
 * POST /api/import
 * 
 * Purpose:
 * Endpoint for Phase 1.
 * Parses raw CSV and registers all anomalies.
 */
router.post('/', async (req, res, next) => {
  try {
    const { csvText } = req.body;
    if (!csvText) {
      return res.status(400).json({ error: 'CSV text is required' });
    }

    const result = await parseAndScanCSV('expenses_export.csv', csvText);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/import/:runId
 * 
 * Purpose:
 * Returns the status and list of anomalies for a run.
 */
router.get('/:runId', async (req, res, next) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) {
      return res.status(400).json({ error: 'Invalid import run ID' });
    }

    const run = await prisma.importRun.findUnique({
      where: { id: runId },
      include: {
        anomalies: { orderBy: { rowNumber: 'asc' } }
      }
    });

    if (!run) {
      return res.status(404).json({ error: 'Import run not found' });
    }

    res.json(run);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/import/:runId/resolve
 * 
 * Purpose:
 * Records the user's resolution decisions for anomalies.
 * 
 * Body:
 * {
 *   resolutions: {
 *     [anomalyId]: {
 *       resolution: 'ACCEPTED' | 'MODIFIED' | 'SKIPPED',
 *       resolvedData: { ...custom inputs... }
 *     }
 *   }
 * }
 */
router.post('/:runId/resolve', async (req, res, next) => {
  try {
    const runId = parseInt(req.params.runId);
    const { resolutions } = req.body;

    if (isNaN(runId)) {
      return res.status(400).json({ error: 'Invalid import run ID' });
    }
    if (!resolutions || typeof resolutions !== 'object') {
      return res.status(400).json({ error: 'Resolutions object is required' });
    }

    // Update each anomaly in a transaction
    await prisma.$transaction(
      Object.entries(resolutions).map(([anomalyId, details]) => {
        return prisma.importAnomaly.update({
          where: { id: parseInt(anomalyId) },
          data: {
            resolution: details.resolution,
            resolvedData: details.resolvedData ? JSON.stringify(details.resolvedData) : null
          }
        });
      })
    );

    res.json({ message: 'Resolutions submitted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/import/:runId/execute
 * 
 * Purpose:
 * Finalizes the import and writes Expense, Split, and Settlement records.
 * Summons importService.executeImport to run calculations.
 * 
 * Body:
 * {
 *   groupId: Number
 * }
 */
router.post('/:runId/execute', async (req, res, next) => {
  try {
    const runId = parseInt(req.params.runId);
    const { groupId } = req.body;

    if (isNaN(runId)) {
      return res.status(400).json({ error: 'Invalid import run ID' });
    }
    if (!groupId) {
      return res.status(400).json({ error: 'Group ID is required' });
    }

    // Verify all ERROR anomalies have been resolved first
    const run = await prisma.importRun.findUnique({
      where: { id: runId },
      include: { anomalies: true }
    });

    if (!run) {
      return res.status(404).json({ error: 'Import run not found' });
    }

    const hasPendingError = run.anomalies.some(
      a => a.severity === 'ERROR' && a.resolution === 'PENDING'
    );

    if (hasPendingError) {
      return res.status(400).json({
        error: 'Cannot execute import. You must resolve all ERROR anomalies first.'
      });
    }

    const report = await executeImport(runId, parseInt(groupId));
    res.json(report);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/import/:runId/report
 * 
 * Purpose:
 * Generates a machine-readable summary report for a completed import run.
 */
router.get('/:runId/report', async (req, res, next) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) {
      return res.status(400).json({ error: 'Invalid import run ID' });
    }

    const run = await prisma.importRun.findUnique({
      where: { id: runId },
      include: {
        anomalies: true,
        expenses: { include: { splits: true } },
        settlements: true
      }
    });

    if (!run) {
      return res.status(404).json({ error: 'Import run not found' });
    }
    if (run.status !== 'COMPLETE') {
      return res.status(400).json({ error: 'Import run is not completed yet.' });
    }

    // Compile report object
    const report = {
      filename: run.filename,
      importedAt: run.importedAt,
      status: run.status,
      totalRows: run.totalRows,
      importedRowsCount: run.importedRows,
      skippedRowsCount: run.skippedRows,
      expensesCount: run.expenses.length,
      settlementsCount: run.settlements.length,
      anomalies: run.anomalies.map(a => ({
        rowNumber: a.rowNumber,
        anomalyType: a.anomalyType,
        severity: a.severity,
        resolution: a.resolution,
        resolvedData: a.resolvedData ? JSON.parse(a.resolvedData) : null
      }))
    };

    res.json(report);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
