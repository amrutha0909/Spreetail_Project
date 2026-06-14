import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { ArrowLeft, Receipt, Plus, Users, Calendar, ArrowRight, Info, CheckCircle2 } from 'lucide-react';

/**
 * Settlements Page Component
 * 
 * Purpose:
 * Allows group members to record direct cash payments (settling up debt) and displays past settlements.
 * 
 * Requirements:
 * - Direct balance adjustments (adds positive/negative credit directly in balances computation).
 * - Log of settlements in a clean, scanable table.
 * - Time-bounded membership validation: Only active group members on the payment date can pay/receive.
 */
export default function Settlements() {
  const { id } = useParams(); // Group ID
  const [group, setGroup] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [payerId, setPayerId] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  
  // Eligible members based on selected date
  const [eligibleMembers, setEligibleMembers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch group details and past settlements
  const fetchData = async () => {
    try {
      setError('');
      const groupRes = await api.get(`/api/groups/${id}`);
      setGroup(groupRes.data);

      const settlementsRes = await api.get(`/api/groups/${id}/settlements`);
      setSettlements(settlementsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch settlements');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  /**
   * isMemberActiveOnDate
   * Checks if member was in the group on the chosen date.
   */
  const isMemberActiveOnDate = (member, selectedDateStr) => {
    if (!selectedDateStr) return false;
    const selected = new Date(selectedDateStr);
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

  // Filter members dynamically when date changes
  useEffect(() => {
    if (group && group.members) {
      const filtered = group.members.filter(m => isMemberActiveOnDate(m, date));
      setEligibleMembers(filtered);

      const eligibleIds = filtered.map(m => m.id);
      
      // Auto-populate form default select values
      if (eligibleIds.length >= 2) {
        if (!eligibleIds.includes(Number(payerId))) setPayerId(eligibleIds[0].toString());
        if (!eligibleIds.includes(Number(payeeId))) setPayeeId(eligibleIds[1].toString());
      }
    }
  }, [date, group]);

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (payerId === payeeId) {
      setError('Payer and payee cannot be the same user.');
      return;
    }

    setSubmitting(true);

    try {
      await api.post(`/api/groups/${id}/settlements`, {
        payerId: Number(payerId),
        payeeId: Number(payeeId),
        amount: Number(amount),
        date: new Date(date).toISOString(),
        notes
      });

      setSuccess('Payment recorded successfully!');
      setAmount('');
      setNotes('');
      
      // Refresh past settlements logs
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to record settlement');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header and Back Navigation */}
      <div className="flex items-center space-x-4 border-b border-slate-800 pb-5">
        <Link to={`/groups/${id}`} className="p-2 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100">Settle Debts</h1>
          <p className="text-slate-400 text-sm">
            {group?.name ? `Record direct cash payments for ${group.name}` : 'Record a flatmate payment'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center space-x-2">
          <CheckCircle2 className="h-5 w-5" />
          <span>{success}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns: Form to Record New Payment */}
        <div className="glass-panel p-6 space-y-6">
          <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2">
            <Plus className="h-5.5 w-5.5 text-indigo-400" />
            <span>Record a Payment</span>
          </h2>

          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="paymentDate">
                Payment Date
              </label>
              <input
                id="paymentDate"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="paymentPayer">
                Who Paid? (Debtor)
              </label>
              <select
                id="paymentPayer"
                value={payerId}
                onChange={(e) => setPayerId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                required
              >
                {eligibleMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-center text-slate-500 py-1">
              <ArrowRight className="h-5 w-5 rotate-90 lg:rotate-0" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="paymentPayee">
                Who Was Paid? (Creditor)
              </label>
              <select
                id="paymentPayee"
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500"
                required
              >
                {eligibleMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="paymentAmount">
                Amount Paid (INR)
              </label>
              <input
                id="paymentAmount"
                type="number"
                step="any"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5" htmlFor="paymentNotes">
                Notes
              </label>
              <input
                id="paymentNotes"
                type="text"
                placeholder="e.g. Settle March groceries"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || eligibleMembers.length < 2}
              className="gradient-btn w-full flex items-center justify-center space-x-2 py-3 mt-6 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <span>Record Settlement</span>
              )}
            </button>
          </form>
        </div>

        {/* Right Columns: Settlement Log Table (takes 2 grid slots) */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold text-slate-200 flex items-center space-x-2">
            <Receipt className="h-5.5 w-5.5 text-emerald-400" />
            <span>Past Settlement Logs</span>
          </h2>

          {settlements.length === 0 ? (
            <div className="glass-panel text-center py-20 px-6">
              <Receipt className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-350">No settlements logged yet</h3>
              <p className="text-slate-400 mt-1 text-sm max-w-sm mx-auto">
                Once a flatmate records a payment to another member, it will be listed here.
              </p>
            </div>
          ) : (
            <div className="glass-panel overflow-hidden border border-slate-800/80 rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-300 font-semibold text-sm">
                      <th className="py-4 px-6">Date</th>
                      <th className="py-4 px-6">Payer</th>
                      <th className="py-4 px-6">Payee</th>
                      <th className="py-4 px-6">Amount</th>
                      <th className="py-4 px-6">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 text-sm">
                    {settlements.map((set) => (
                      <tr key={set.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-4 px-6 text-slate-400">
                          {new Date(set.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="py-4 px-6 font-semibold text-slate-200">
                          {set.payer?.name}
                        </td>
                        <td className="py-4 px-6 font-semibold text-slate-200">
                          {set.payee?.name}
                        </td>
                        <td className="py-4 px-6 font-bold text-emerald-400">
                          ₹{Number(set.amount).toFixed(2)}
                        </td>
                        <td className="py-4 px-6 text-slate-400 italic">
                          {set.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
