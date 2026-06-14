import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import SplitEditor from './SplitEditor';
import { Calendar, DollarSign, FileText, User, Users, X } from 'lucide-react';

/**
 * ExpenseForm Component
 * 
 * Purpose:
 * Renders a modal overlay form to log a new group expense.
 * Handles validation and maps user inputs (including split ratios, exact amounts, or percentages)
 * to the API structure.
 * 
 * Requirements:
 * - Dynamic split editor based on EQUAL, PERCENTAGE, SHARE, or UNEQUAL split types.
 * - Time-bounded membership validation: Filters the members list dynamically based on the Selected Date.
 *   If a member has not joined yet or has left the group by the expense date, they cannot participate in the split.
 * - Automatic conversion values/exchange rates for USD expenses.
 */
export default function ExpenseForm({ group, onClose, onSuccess }) {
  // Core expense fields
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState('83.50'); // Reasonable default rate for USD
  const [paidById, setPaidById] = useState('');
  const [splitType, setSplitType] = useState('EQUAL');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
  const [notes, setNotes] = useState('');
  
  // List of group members eligible to participate based on selected date
  const [eligibleMembers, setEligibleMembers] = useState([]);
  
  // Checked participants in the split
  const [checkedMembers, setCheckedMembers] = useState([]);
  
  // Ratios/Exact values per member for splits (userId -> value)
  const [splitDetails, setSplitDetails] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /**
   * isMemberActiveOnDate
   * 
   * Purpose:
   * Returns true if a member's group membership covers the selected date.
   * Format: U.joinedAt <= date AND (U.leftAt IS NULL OR U.leftAt >= date).
   */
  const isMemberActiveOnDate = (member, selectedDateStr) => {
    if (!selectedDateStr) return false;
    const selected = new Date(selectedDateStr);
    
    // Normalize date timings to avoid offset issues
    const selectedTime = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate()).getTime();
    
    const joined = new Date(member.joinedAt);
    const joinedTime = new Date(joined.getFullYear(), joined.getMonth(), joined.getDate()).getTime();

    if (joinedTime > selectedTime) return false;

    if (member.leftAt) {
      const left = new Date(member.leftAt);
      const leftTime = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
      if (leftTime < selectedTime) return false;
    }

    return true;
  };

  // Trigger filtering of eligible members whenever selected date or group members list changes
  useEffect(() => {
    if (group && group.members) {
      const filtered = group.members.filter(member => isMemberActiveOnDate(member, date));
      setEligibleMembers(filtered);

      // Auto-check all eligible members if checked list is empty or reset invalid selections
      const eligibleIds = filtered.map(m => m.id);
      
      // Auto-select everyone eligible by default
      const nextChecked = checkedMembers.filter(id => eligibleIds.includes(id));
      if (nextChecked.length === 0 && eligibleIds.length > 0) {
        setCheckedMembers(eligibleIds);
        // Initialize default splits
        const initDetails = {};
        eligibleIds.forEach(id => {
          initDetails[id] = splitType === 'PERCENTAGE' ? '' : splitType === 'SHARE' ? '1' : '';
        });
        setSplitDetails(initDetails);
      } else {
        setCheckedMembers(nextChecked);
      }

      // Ensure the selected payer is also in the list of group members
      // (Even if they departed, they could pay for historic things, but typically payer must be active)
      if (eligibleIds.length > 0 && !eligibleIds.includes(Number(paidById))) {
        setPaidById(eligibleIds[0].toString());
      }
    }
  }, [date, group]);

  // Handle resetting split inputs when splitType changes
  useEffect(() => {
    const nextDetails = {};
    checkedMembers.forEach(id => {
      nextDetails[id] = splitType === 'SHARE' ? '1' : '';
    });
    setSplitDetails(nextDetails);
  }, [splitType]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (checkedMembers.length === 0) {
      setError('Please select at least one participant for the split.');
      return;
    }
    setError('');

    // Pre-validation for percentages or unequal amounts
    const valuesArray = checkedMembers.map(id => Number(splitDetails[id]) || 0);
    const sumValues = valuesArray.reduce((s, v) => s + v, 0);

    if (splitType === 'PERCENTAGE') {
      if (Math.abs(sumValues - 100) > 0.02) {
        setError(`Percentages must sum to 100%. Current sum: ${sumValues}%`);
        return;
      }
    }

    if (splitType === 'UNEQUAL') {
      const totalAmount = Number(amount) || 0;
      if (Math.abs(sumValues - totalAmount) > 0.02) {
        setError(`Exact amounts must sum to the total expense amount (₹${totalAmount.toFixed(2)}). Current sum: ₹${sumValues.toFixed(2)}`);
        return;
      }
    }

    setSubmitting(true);

    try {
      // Map frontend state to API format
      const formattedDetails = checkedMembers.map(id => ({
        userId: Number(id),
        value: Number(splitDetails[id]) || 0
      }));

      const payload = {
        description,
        amount: Number(amount),
        currency,
        exchangeRate: currency === 'USD' ? Number(exchangeRate) : undefined,
        paidById: Number(paidById),
        splitType,
        date: new Date(date).toISOString(),
        notes,
        participants: checkedMembers.map(id => Number(id)),
        splitDetails: splitType === 'EQUAL' ? undefined : formattedDetails
      };

      await api.post(`/api/groups/${group.id}/expenses`, payload);
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit expense');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="glass-panel w-full max-w-lg p-6 bg-slate-900 animate-in fade-in zoom-in-95 duration-150 my-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
          <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2">
            <Users className="h-5 w-5 text-indigo-400" />
            <span>Add Group Expense</span>
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-5 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expDesc">
                Description
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <FileText className="h-4 w-4" />
                </span>
                <input
                  id="expDesc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Weekly Groceries"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expDate">
                Date
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <Calendar className="h-4 w-4" />
                </span>
                <input
                  id="expDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expAmount">
                Amount
              </label>
              <input
                id="expAmount"
                type="number"
                step="any"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                placeholder="0.00"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expCurrency">
                Currency
              </label>
              <select
                id="expCurrency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>

            {currency === 'USD' && (
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expRate">
                  USD/INR Rate
                </label>
                <input
                  id="expRate"
                  type="number"
                  step="any"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expPayer">
                Paid By
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                  <User className="h-4 w-4" />
                </span>
                <select
                  id="expPayer"
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                  required
                >
                  {eligibleMembers.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expSplitType">
                Split Method
              </label>
              <select
                id="expSplitType"
                value={splitType}
                onChange={(e) => setSplitType(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="EQUAL">EQUAL</option>
                <option value="PERCENTAGE">PERCENTAGE</option>
                <option value="SHARE">SHARE (Ratio)</option>
                <option value="UNEQUAL">UNEQUAL</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="expNotes">
              Notes / Comment
            </label>
            <input
              id="expNotes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              placeholder="e.g. Rent share adjustments"
            />
          </div>

          {/* Renders the dynamic editor panel based on split selection */}
          <SplitEditor
            members={eligibleMembers}
            splitType={splitType}
            amount={currency === 'USD' ? (Number(amount) || 0) * (Number(exchangeRate) || 83.5) : (Number(amount) || 0)}
            splitDetails={splitDetails}
            onChange={setSplitDetails}
            checkedMembers={checkedMembers}
            onCheckedChange={setCheckedMembers}
          />

          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="gradient-btn text-sm flex items-center justify-center space-x-2 cursor-pointer"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>Log Expense</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
