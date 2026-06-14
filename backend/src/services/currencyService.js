/**
 * Currency Service
 * 
 * Purpose:
 * Provides USD-to-INR currency exchange rate lookup services.
 * Conforms to historical rates policy.
 * 
 * Requirements:
 * 1. Look up the historical rate for the expense date using a public API (e.g. Fawaz Ahmed's currency-api).
 * 2. If the historical rate is unavailable (e.g., date in future, rate not published, rate API down, or offline),
 *    attempt to fetch the latest rate.
 * 3. If that also fails, fall back to the hardcoded average rate of ₹83.50 per USD (early 2026 average).
 * 4. This policy is documented in `DECISIONS.md`.
 */

const FALLBACK_USD_INR_RATE = 83.50;

/**
 * getUSDRate
 * 
 * @param {string|Date} date - Date of the expense.
 * @returns {Promise<number>} Converted USD to INR rate.
 */
async function getUSDRate(date) {
  let dateStr = '';
  try {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      dateStr = d.toISOString().split('T')[0];
    }
  } catch (err) {
    console.error('[Currency Service] Date conversion failed:', err);
  }

  // 1. Attempt historical rate fetch (Fawaz Ahmed's CDN is free and public)
  if (dateStr) {
    const historicalUrl = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${dateStr}/v1/currencies/usd.json`;
    try {
      console.log(`[Currency Service] Fetching historical rate for ${dateStr} from: ${historicalUrl}`);
      const response = await fetch(historicalUrl);
      if (response.ok) {
        const data = await response.json();
        if (data && data.usd && typeof data.usd.inr === 'number') {
          console.log(`[Currency Service] Mapped historical rate: 1 USD = ₹${data.usd.inr}`);
          return data.usd.inr;
        }
      }
    } catch (apiError) {
      console.warn(`[Currency Service] Historical rate lookup failed for ${dateStr}. Attempting fallback...`, apiError.message);
    }
  }

  // 2. Attempt latest rate fetch as fallback
  const latestUrl = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
  try {
    console.log('[Currency Service] Fetching latest rate from:', latestUrl);
    const response = await fetch(latestUrl);
    if (response.ok) {
      const data = await response.json();
      if (data && data.usd && typeof data.usd.inr === 'number') {
        console.log(`[Currency Service] Mapped latest rate: 1 USD = ₹${data.usd.inr}`);
        return data.usd.inr;
      }
    }
  } catch (latestError) {
    console.warn('[Currency Service] Latest rate lookup failed. Using hardcoded average rate.', latestError.message);
  }

  // 3. Fall back to early 2026 average hardcoded rate
  console.log(`[Currency Service] Using hardcoded fallback rate: 1 USD = ₹${FALLBACK_USD_INR_RATE}`);
  return FALLBACK_USD_INR_RATE;
}

module.exports = {
  getUSDRate,
  FALLBACK_USD_INR_RATE
};
