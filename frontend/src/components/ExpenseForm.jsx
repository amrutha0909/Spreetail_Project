import React from 'react';

/**
 * ExpenseForm Component (Placeholder)
 * 
 * Purpose:
 * Renders a dialog to input and save group expenses.
 * Currently serves as a placeholder to allow standard routing/compilation on Group Detail.
 * Will be fully implemented in a later step with dynamic split selectors (EQUAL, PERCENTAGE, SHARE, UNEQUAL).
 * 
 * Requirements:
 * - Select split types.
 * - Input amounts and descriptions.
 * - Distribute splits across members correctly.
 */
export default function ExpenseForm({ group, onClose, onSuccess }) {
  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="glass-panel w-full max-w-md p-6 bg-slate-900">
        <h2 className="text-xl font-bold text-slate-200 mb-4">Add Expense (Placeholder)</h2>
        <p className="text-sm text-slate-400">
          This form is a placeholder and will be replaced by a fully interactive split editor in a later commit.
        </p>
        <div className="flex items-center justify-end space-x-3 mt-8">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
