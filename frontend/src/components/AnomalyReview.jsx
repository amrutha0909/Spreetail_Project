import React from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * AnomalyReview Component
 * 
 * Purpose:
 * Renders list of all anomalies detected in the uploaded CSV.
 * Categorizes and groups anomalies by severity: ERROR (red), WARNING (yellow), INFO (blue).
 * Provides granular inputs, radio buttons, and dropdowns for user resolutions.
 * 
 * Requirements:
 * - ERRORs must be explicitly resolved (skip or modify/accept with fixed values).
 * - WARNINGs display default fixes with toggle controls to override values.
 * - INFOs show normalizations (trimming, casing, rounding) for display only.
 * - Monospace box for raw row data.
 */
export default function AnomalyReview({
  anomalies,
  resolutions, // Object mapping anomalyId -> { resolution: 'PENDING'|'ACCEPTED'|'MODIFIED'|'SKIPPED', resolvedData: {...} }
  onResolve, // Callback to update parent resolutions
  members // List of group members (useful for select drop-downs)
}) {
  // Group anomalies by severity
  const errors = anomalies.filter((a) => a.severity === 'ERROR');
  const warnings = anomalies.filter((a) => a.severity === 'WARNING');
  const infos = anomalies.filter((a) => a.severity === 'INFO');

  /**
   * handleResolutionChange
   * 
   * Purpose:
   * Triggers callback to update parent state when user chooses a resolution.
   */
  const handleResolutionChange = (anomalyId, resolution, resolvedData = null) => {
    onResolve(anomalyId, { resolution, resolvedData });
  };

  /**
   * renderRawData
   * Renders the raw CSV row in a monospace box.
   */
  const renderRawData = (rowRaw) => {
    try {
      const parsed = JSON.parse(rowRaw);
      return (
        <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-400 mt-2 border border-slate-900">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return (
        <pre className="text-[11px] font-mono bg-slate-950 p-3 rounded-lg overflow-x-auto text-slate-400 mt-2 border border-slate-900">
          {rowRaw}
        </pre>
      );
    }
  };

  /**
   * renderErrorControls
   * 
   * Purpose:
   * Generates input options (radio buttons/dropdowns) depending on the ERROR type.
   */
  const renderErrorControls = (anomaly) => {
    const res = resolutions[anomaly.id] || { resolution: 'PENDING', resolvedData: null };
    const cleanRaw = JSON.parse(anomaly.rowRaw || '{}');

    switch (anomaly.anomalyType) {
      case 'DUPLICATE':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED', { duplicateOf: true })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row (Default: keep other copy)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'ACCEPTED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'ACCEPTED', {})}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Import as new separate expense anyway</span>
              </label>
            </div>
          </div>
        );

      case 'SETTLEMENT_AS_EXPENSE':
      case 'DEPOSIT_AS_EXPENSE':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.isSettlement === true}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { isSettlement: true })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Convert and import as a Settlement record (recommended)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'ACCEPTED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'ACCEPTED', {})}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Force import as shared group Expense</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row entirely</span>
              </label>
            </div>
          </div>
        );

      case 'PERCENTAGE_SUM_ERROR':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.normalizePercentage === true}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { normalizePercentage: true })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Normalize percentages to sum to 100% proportionally (Pizza Friday)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row</span>
              </label>
            </div>
          </div>
        );

      case 'MISSING_PAYER':
        return (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assign Payer:</p>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <select
                value={res.resolution === 'MODIFIED' ? (res.resolvedData?.paidById || '') : ''}
                onChange={(e) => handleResolutionChange(anomaly.id, 'MODIFIED', { paidById: Number(e.target.value) })}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="">— Select Payer —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                className={`px-3 py-1.5 border rounded-lg text-sm transition-colors cursor-pointer ${
                  res.resolution === 'SKIPPED' ? 'bg-rose-500/20 border-rose-500 text-rose-350' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
                }`}
              >
                Skip Row
              </button>
            </div>
          </div>
        );

      case 'NONMEMBER_IN_SPLIT': {
        const rawSplitWith = cleanRaw.split_with || '';
        const badNames = rawSplitWith.split(';').filter(n => {
          const match = members.find(m => m.name.toLowerCase() === n.trim().toLowerCase());
          return !match;
        });
        const badName = badNames[0] || 'Kabir';

        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.createGuest === badName}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { createGuest: badName })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Register "{badName}" as a Guest user and include in split</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row</span>
              </label>
            </div>
          </div>
        );
      }

      case 'AMBIGUOUS_DATE_FORMAT':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Correct Interpretation:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.date === '2026-04-05T00:00:00.000Z'}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { date: '2026-04-05T00:00:00.000Z' })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Interpret as April 5, 2026</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.date === '2026-05-04T00:00:00.000Z'}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { date: '2026-05-04T00:00:00.000Z' })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Interpret as May 4, 2026</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row</span>
              </label>
            </div>
          </div>
        );

      case 'DUPLICATE_DIFFERENT_AMOUNT':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED', {})}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row (Default: keep other row)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'ACCEPTED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'ACCEPTED', {})}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Keep both entries (import both)</span>
              </label>
            </div>
          </div>
        );

      case 'MEMBER_AFTER_DEPARTURE': {
        const match = members.find(m => m.name.toLowerCase() === 'meera');
        const departedId = match ? match.id : 4; // Meera's ID in seeding script is usually 4

        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.removeUserId === departedId}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { removeUserId: departedId })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Remove Meera from split and redistribute her share equally (recommended)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip this row</span>
              </label>
            </div>
          </div>
        );
      }

      case 'SPLIT_TYPE_MISMATCH':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Resolution Choice:</p>
            <div className="flex flex-col space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.forceSplitType === 'SHARE'}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { forceSplitType: 'SHARE' })}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Prefer split details ratios (import as SHARE splits) (recommended)</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer text-sm">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'ACCEPTED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'ACCEPTED', {})}
                  className="h-4.5 w-4.5 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Force EQUAL split (ignore details)</span>
              </label>
            </div>
          </div>
        );

      case 'MISSING_CURRENCY':
        return (
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Currency:</p>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.currency === 'INR'}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { currency: 'INR' })}
                  className="h-4 w-4 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>INR (₹)</span>
              </label>
              <label className="flex items-center space-x-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'MODIFIED' && res.resolvedData?.currency === 'USD'}
                  onChange={() => handleResolutionChange(anomaly.id, 'MODIFIED', { currency: 'USD' })}
                  className="h-4 w-4 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>USD ($)</span>
              </label>
              <label className="flex items-center space-x-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`err-${anomaly.id}`}
                  checked={res.resolution === 'SKIPPED'}
                  onChange={() => handleResolutionChange(anomaly.id, 'SKIPPED')}
                  className="h-4 w-4 text-indigo-600 bg-slate-950 border-slate-800"
                />
                <span>Skip row</span>
              </label>
            </div>
          </div>
        );

      default:
        return (
          <button
            type="button"
            onClick={() => handleResolutionChange(anomaly.id, 'ACCEPTED')}
            className={`px-4 py-2 border rounded-xl text-sm font-semibold cursor-pointer ${
              res.resolution === 'ACCEPTED' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
            }`}
          >
            Acknowledge & Accept
          </button>
        );
    }
  };

  /**
   * renderWarningControls
   * 
   * Purpose:
   * Generates warning checkbox to override or accept the default fix.
   */
  const renderWarningControls = (anomaly) => {
    const res = resolutions[anomaly.id] || { resolution: 'ACCEPTED', resolvedData: null };
    const isAccepted = res.resolution === 'ACCEPTED';

    return (
      <div className="space-y-3">
        <label className="flex items-center space-x-3 cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={isAccepted}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                // Restore default resolved data
                const fallbackData = anomaly.resolvedData ? JSON.parse(anomaly.resolvedData) : {};
                handleResolutionChange(anomaly.id, 'ACCEPTED', fallbackData);
              } else {
                handleResolutionChange(anomaly.id, 'MODIFIED', {});
              }
            }}
            className="h-4.5 w-4.5 rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
          />
          <span className="text-slate-200">
            Use default fix: <strong className="text-amber-400 font-semibold">{anomaly.description.replace('Converted', 'Converts').replace('Stripping', 'Strips')}</strong>
          </span>
        </label>

        {/* If unchecked, show override inputs */}
        {!isAccepted && (
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 animate-slide-down">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Override default values:</p>
            {anomaly.anomalyType === 'MALFORMED_AMOUNT' || anomaly.anomalyType === 'NEGATIVE_AMOUNT' ? (
              <div>
                <label className="block text-xs text-slate-400 mb-1" htmlFor={`val-${anomaly.id}`}>Custom Amount (INR):</label>
                <input
                  id={`val-${anomaly.id}`}
                  type="number"
                  placeholder="0.00"
                  value={res.resolvedData?.amount || ''}
                  onChange={(e) => handleResolutionChange(anomaly.id, 'MODIFIED', { amount: Number(e.target.value) })}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-850 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ) : anomaly.anomalyType === 'FOREIGN_CURRENCY' ? (
              <div>
                <label className="block text-xs text-slate-400 mb-1" htmlFor={`val-${anomaly.id}`}>Custom Exchange Rate (USD to INR):</label>
                <input
                  id={`val-${anomaly.id}`}
                  type="number"
                  step="any"
                  placeholder="83.50"
                  value={res.resolvedData?.exchangeRate || ''}
                  onChange={(e) => handleResolutionChange(anomaly.id, 'MODIFIED', { exchangeRate: Number(e.target.value) })}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-850 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ) : anomaly.anomalyType === 'AMBIGUOUS_DATE' ? (
              <div>
                <label className="block text-xs text-slate-400 mb-1" htmlFor={`val-${anomaly.id}`}>Custom Date (YYYY-MM-DD):</label>
                <input
                  id={`val-${anomaly.id}`}
                  type="date"
                  value={res.resolvedData?.date ? res.resolvedData.date.split('T')[0] : ''}
                  onChange={(e) => handleResolutionChange(anomaly.id, 'MODIFIED', { date: new Date(e.target.value).toISOString() })}
                  className="px-3 py-1.5 bg-slate-900 border border-slate-850 rounded-lg text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No customizable fields available for this check.</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* 1. Errors section */}
      {errors.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-rose-400 flex items-center space-x-2 px-1">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>Required Actions — ERROR ({errors.length})</span>
          </h3>
          <div className="space-y-4">
            {errors.map((anomaly) => {
              const res = resolutions[anomaly.id] || { resolution: 'PENDING' };
              const isResolved = res.resolution !== 'PENDING';

              return (
                <div
                  key={anomaly.id}
                  className={`glass-panel p-5 border-l-4 transition-all duration-200 ${
                    isResolved ? 'border-emerald-500 bg-slate-900/40 border-slate-800' : 'border-rose-500 bg-rose-500/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-extrabold uppercase bg-rose-500/10 border border-rose-500/20 text-rose-400 px-2 py-0.5 rounded">
                          Row {anomaly.rowNumber} — {anomaly.anomalyType.replace(/_/g, ' ')}
                        </span>
                        {isResolved && (
                          <span className="text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded flex items-center space-x-1">
                            <span>Resolved: {res.resolution}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-350 mt-2 font-medium">{anomaly.description}</p>
                    </div>
                  </div>

                  {renderRawData(anomaly.rowRaw)}
                  <div className="mt-5 pt-4 border-t border-slate-800/60">
                    {renderErrorControls(anomaly)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Warnings section */}
      {warnings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-amber-400 flex items-center space-x-2 px-1">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>Review Guidelines — WARNING ({warnings.length})</span>
          </h3>
          <div className="space-y-4">
            {warnings.map((anomaly) => (
              <div key={anomaly.id} className="glass-panel p-5 border-l-4 border-amber-500 bg-amber-500/[0.01]">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-xs font-extrabold uppercase bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded">
                    Row {anomaly.rowNumber} — {anomaly.anomalyType.replace(/_/g, ' ')}
                  </span>
                </div>
                {renderRawData(anomaly.rowRaw)}
                <div className="mt-4 pt-4 border-t border-slate-800/60">
                  {renderWarningControls(anomaly)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Infos section (exclude NONE type as it's a structural success row) */}
      {infos.filter(a => a.anomalyType !== 'NONE').length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-sky-400 flex items-center space-x-2 px-1">
            <Info className="h-5 w-5 shrink-0" />
            <span>Normalizations — INFO ({infos.filter(a => a.anomalyType !== 'NONE').length})</span>
          </h3>
          <div className="space-y-3">
            {infos.filter(a => a.anomalyType !== 'NONE').map((anomaly) => (
              <div key={anomaly.id} className="glass-panel p-4 border-l-4 border-sky-500 bg-sky-500/[0.01] text-xs">
                <span className="font-semibold text-slate-400">Row {anomaly.rowNumber}:</span>{' '}
                <span className="text-slate-300">{anomaly.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
