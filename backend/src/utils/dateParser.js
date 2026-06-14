/**
 * Date Parser Utility
 * 
 * Purpose:
 * Safely parses multiple date string formats into standard JavaScript Date objects.
 * Handles:
 * 1. DD-MM-YYYY (e.g., "15-03-2026")
 * 2. YYYY-MM-DD (e.g., "2026-03-15")
 * 3. MMM-DD (e.g., "Mar-14" -> parses to 14 March 2026)
 * 4. DD-MMM-YYYY (e.g., "14-Mar-2026")
 * 
 * Requirements:
 * - Return a valid Date object if successfully parsed.
 * - Return null if the date format is unsupported or invalid, allowing the import service
 *   to flag it as an AMBIGUOUS_DATE anomaly.
 */

const MONTHS_MAP = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/**
 * parseDate
 * 
 * @param {string} dateStr - Raw date string to parse.
 * @returns {Date|null} Decoded Date object, or null if invalid.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // 1. DD-MM-YYYY Format
  const dmyRegex = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;
  let match = clean.match(dmyRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed month
    const year = parseInt(match[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (isValidDate(date, year, month, day)) return date;
  }

  // 2. YYYY-MM-DD Format
  const ymdRegex = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
  match = clean.match(ymdRegex);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (isValidDate(date, year, month, day)) return date;
  }

  // 3. MMM-DD Format (e.g. "Mar-14" -> 2026-03-14)
  const mmdRegex = /^([a-zA-Z]{3})-(\d{1,2})$/;
  match = clean.match(mmdRegex);
  if (match) {
    const monthStr = match[1].toLowerCase();
    const day = parseInt(match[2], 10);
    const month = MONTHS_MAP[monthStr];
    const year = 2026; // Default context year for this spreadsheet dataset

    if (month !== undefined) {
      const date = new Date(Date.UTC(year, month, day));
      if (isValidDate(date, year, month, day)) return date;
    }
  }

  // 4. DD-MMM-YYYY Format (e.g. "14-Mar-2026")
  const dmyTextRegex = /^(\d{1,2})-([a-zA-Z]{3,4})-(\d{4})$/;
  match = clean.match(dmyTextRegex);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthStr = match[2].toLowerCase().substring(0, 3);
    const year = parseInt(match[3], 10);
    const month = MONTHS_MAP[monthStr];

    if (month !== undefined) {
      const date = new Date(Date.UTC(year, month, day));
      if (isValidDate(date, year, month, day)) return date;
    }
  }

  // Standard JS Date constructor as a final fallback (if it parses cleanly)
  const parsedFallback = new Date(clean);
  if (!isNaN(parsedFallback.getTime())) {
    return parsedFallback;
  }

  return null;
}

/**
 * Helper to validate if date values didn't overflow (e.g. Feb 31 -> Mar 3)
 */
function isValidDate(date, y, m, d) {
  return (
    date &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m &&
    date.getUTCDate() === d
  );
}

module.exports = {
  parseDate
};
