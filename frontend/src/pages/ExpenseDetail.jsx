import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { ArrowLeft, Calendar, FileText, Receipt, Sparkles, User, Users } from 'lucide-react';

/**
 * ExpenseDetail Component
 * 
 * Purpose:
 * Renders the detailed view of an individual expense.
 * Shows original amounts, currency conversion, exchange rates used, notes,
 * and a scanable breakdown table of who owes what (Rohan's requirement).
 * 
 * Requirements:
 * - Table-based breakdown for scanability.
 * - Multi-currency display: ₹44,946.60 ($540 @ ₹83.23)
 * - Round splits and display in INR with 2 decimal places.
 */
export default function ExpenseDetail() {
  const { id, eid } = useParams(); // Gets group id and expense id from URL
  const [expense, setExpense] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch expense detail on mount
  useEffect(() => {
    const fetchExpense = async () => {
      try {
        const response = await api.get(`/api/groups/${id}/expenses/${eid}`);
        setExpense(response.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch expense details');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchExpense();
  }, [id, eid]);

  /**
   * formatCurrency
   * Formats numbers to INR currency style.
   */
  const formatCurrency = (amt) => {
    return `₹${Number(amt).toFixed(2)}`;
  };

  /**
   * getShareDisplay
   * Displays the share values cleanly depending on splitType.
   */
  const getShareDisplay = (share, type) => {
    const s = Number(share);
    switch (type) {
      case 'EQUAL':
        return 'Equal split';
      case 'PERCENTAGE':
        return `${s.toFixed(2)}%`;
      case 'SHARE':
        return `${s} share${s !== 1 ? 's' : ''}`;
      case 'UNEQUAL':
        return `Exact amount (₹${s.toFixed(2)})`;
      default:
        return s;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error || !expense) {
    return (
      <div className="space-y-4 max-w-md mx-auto text-center py-12">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error || 'Expense not found'}
        </div>
        <Link to={`/groups/${id}`} className="inline-flex items-center space-x-2 text-indigo-400 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Group</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header and Back navigation */}
      <div className="flex items-center space-x-4 border-b border-slate-800 pb-5">
        <Link to={`/groups/${id}`} className="p-2 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100">Expense Details</h1>
          <p className="text-slate-400 text-sm">Review split breakdown and currency calculations</p>
        </div>
      </div>

      {/* Main card details */}
      <div className="glass-panel p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
          <div className="space-y-1">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {expense.splitType} Split
            </span>
            <h2 className="text-2xl font-bold text-slate-100">{expense.description}</h2>
            <div className="flex items-center space-x-2 text-sm text-slate-400 mt-2">
              <Calendar className="h-4 w-4" />
              <span>{new Date(expense.date).toLocaleDateString('en-IN', { dateStyle: 'long' })}</span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Amount</p>
            <p className="text-3xl font-black text-slate-200 mt-1">
              {formatCurrency(expense.amountInr)}
            </p>
            {expense.currency === 'USD' && (
              <p className="text-xs text-indigo-400 mt-1">
                Original: ${expense.amount} USD @ ₹{expense.exchangeRate}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start space-x-3 bg-slate-950/40 p-4 border border-slate-800 rounded-xl">
            <User className="h-5 w-5 text-indigo-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Paid By</p>
              <p className="text-base font-semibold text-slate-200 mt-0.5">{expense.paidBy?.name}</p>
              <p className="text-xs text-slate-400">{expense.paidBy?.email}</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 bg-slate-950/40 p-4 border border-slate-800 rounded-xl">
            <FileText className="h-5 w-5 text-indigo-400 mt-0.5" />
            <div>
              <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Notes / Comments</p>
              <p className="text-base text-slate-200 mt-0.5 italic">
                {expense.notes || 'No notes added to this expense.'}
              </p>
            </div>
          </div>
        </div>

        {/* Breakdown split details table */}
        <div className="space-y-4 pt-4">
          <h3 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
            <Users className="h-5 w-5 text-indigo-400" />
            <span>Split Breakdown</span>
          </h3>

          <div className="border border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-300 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3.5 px-6">Member Name</th>
                  <th className="py-3.5 px-6">Split Ratio / Share</th>
                  <th className="py-3.5 px-6 text-right">Amount Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 text-sm">
                {expense.splits?.map((split) => (
                  <tr key={split.id} className="hover:bg-slate-900/20">
                    <td className="py-4 px-6 font-medium text-slate-200">
                      {split.user?.name} {split.userId === expense.paidById && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded px-1 py-0.25 ml-1.5 font-bold">Payer</span>}
                    </td>
                    <td className="py-4 px-6 text-slate-400">
                      {getShareDisplay(split.share, expense.splitType)}
                    </td>
                    <td className="py-4 px-6 text-right text-slate-100 font-bold">
                      {formatCurrency(split.amountOwed)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
