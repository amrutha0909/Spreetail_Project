const express = require('express');
const router = express.Router();
const prisma = require('../prisma');
const authMiddleware = require('../middleware/auth');
const { parseAndScanCSV } = require('../services/importService');

// Apply auth middleware to all import routes
router.use(authMiddleware);

/**
 * POST /api/import
 * 
 * Purpose:
 * Endpoint for Phase 1 of the CSV import pipeline.
 * Accepts the raw CSV text, parses it, runs the 19 anomaly checks,
 * saves the run state in database (status PENDING/REVIEW), and returns the results.
 * 
 * Requirements:
 * - Does NOT write any expense/settlement records yet (two-phase import rule).
 * - Expects { csvText } in the JSON request body.
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
 * Retrieves the status and all flagged anomalies for a specific import run.
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
        anomalies: true
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

module.exports = router;
