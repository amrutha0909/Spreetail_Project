import React, { useEffect } from 'react';

/**
 * SplitEditor Component
 * 
 * Purpose:
 * Renders dynamic inputs depending on the selected split type (EQUAL, PERCENTAGE, SHARE, UNEQUAL).
 * Handles participant checkboxes and live validation indicators (e.g., sum must equal 100% or total amount).
 * 
 * Requirements:
 * - EQUAL: Checkboxes to select participants, auto-calculates equal divisions.
 * - PERCENTAGE: Inputs per participant with a running total validation indicator (must equal 100%).
 * - SHARE: Proportional share integer inputs (ratios).
 * - UNEQUAL: Exact currency amount inputs with a running sum validation vs the total amount.
 */
export default function SplitEditor({
  members,
  splitType,
  amount,
  splitDetails, // Object mapping userId -> value (percentage, shares, or exact amount)
  onChange,
  checkedMembers, // Array of userIds included in the split
  onCheckedChange
}) {
  const totalAmount = Number(amount) || 0;

  // Toggle user inclusion in split
  const handleToggleCheck = (userId) => {
    if (checkedMembers.includes(userId)) {
      onCheckedChange(checkedMembers.filter(id => id !== userId));
      // Remove from details
      const nextDetails = { ...splitDetails };
      delete nextDetails[userId];
      onChange(nextDetails);
    } else {
      onCheckedChange([...checkedMembers, userId]);
      // Initialize with default values
      onChange({
        ...splitDetails,
        [userId]: splitType === 'PERCENTAGE' ? '' : splitType === 'SHARE' ? '1' : ''
      });
    }
  };

  const handleValueChange = (userId, value) => {
    onChange({
      ...splitDetails,
      [userId]: value
    });
  };

  // Run auto-distribution calculation for visual preview
  const getPreviewAmount = (userId) => {
    if (!checkedMembers.includes(userId)) return 0;
    
    switch (splitType) {
      case 'EQUAL': {
        const count = checkedMembers.length;
        return count > 0 ? (totalAmount / count).toFixed(2) : 0;
      }
      case 'PERCENTAGE': {
        const pct = Number(splitDetails[userId]) || 0;
        return ((totalAmount * pct) / 100).toFixed(2);
      }
      case 'SHARE': {
        const totalShares = checkedMembers.reduce((sum, id) => sum + (Number(splitDetails[id]) || 0), 0);
        const userShares = Number(splitDetails[userId]) || 0;
        return totalShares > 0 ? ((totalAmount * userShares) / totalShares).toFixed(2) : 0;
      }
      case 'UNEQUAL': {
        return (Number(splitDetails[userId]) || 0).toFixed(2);
      }
      default:
        return 0;
    }
  };

  // Compute validations
  const sumValues = checkedMembers.reduce((sum, id) => sum + (Number(splitDetails[id]) || 0), 0);

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <span className="text-sm font-semibold text-slate-300">Split details</span>
        
        {/* Running total validation labels */}
        {splitType === 'PERCENTAGE' && (
          <span className={`text-xs font-bold ${Math.abs(sumValues - 100) < 0.02 ? 'text-emerald-400' : 'text-amber-400'}`}>
            Total: {sumValues}% / 100%
          </span>
        )}
        {splitType === 'UNEQUAL' && (
          <span className={`text-xs font-bold ${Math.abs(sumValues - totalAmount) < 0.02 ? 'text-emerald-400' : 'text-amber-400'}`}>
            Split: ₹{sumValues.toFixed(2)} / ₹{totalAmount.toFixed(2)}
          </span>
        )}
      </div>

      <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
        {members.map((member) => {
          const isChecked = checkedMembers.includes(member.id);
          return (
            <div key={member.id} className="flex items-center justify-between p-2.5 bg-slate-950/40 border border-slate-800 rounded-xl">
              <label className="flex items-center space-x-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleCheck(member.id)}
                  className="h-4.5 w-4.5 rounded border-slate-800 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
                <div>
                  <p className="text-sm font-medium text-slate-200">{member.name}</p>
                  <p className="text-[10px] text-slate-500">{member.email}</p>
                </div>
              </label>

              {isChecked && (
                <div className="flex items-center space-x-3">
                  {/* Dynamic inputs based on splitType */}
                  {splitType === 'PERCENTAGE' && (
                    <div className="relative w-20">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        placeholder="0"
                        value={splitDetails[member.id] || ''}
                        onChange={(e) => handleValueChange(member.id, e.target.value)}
                        className="w-full text-right pr-6 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                      />
                      <span className="absolute inset-y-0 right-2 flex items-center text-slate-500 text-xs font-semibold">%</span>
                    </div>
                  )}

                  {splitType === 'SHARE' && (
                    <div className="relative w-20">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        placeholder="1"
                        value={splitDetails[member.id] || '1'}
                        onChange={(e) => handleValueChange(member.id, e.target.value)}
                        className="w-full text-right px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {splitType === 'UNEQUAL' && (
                    <div className="relative w-28">
                      <span className="absolute inset-y-0 left-2 flex items-center text-slate-500 text-xs">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0.00"
                        value={splitDetails[member.id] || ''}
                        onChange={(e) => handleValueChange(member.id, e.target.value)}
                        className="w-full text-right pl-5 pr-2 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  {/* Division Preview */}
                  <span className="text-xs font-semibold text-slate-400 w-24 text-right">
                    ₹{Number(getPreviewAmount(member.id)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
