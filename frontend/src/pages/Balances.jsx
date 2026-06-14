import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { ArrowLeft, Wallet, Info, Sparkles, Receipt, CheckCircle, HelpCircle, ArrowRight } from 'lucide-react';

/**
 * Balances Page Component
 * 
 * Purpose:
 * Displays group-wise balances, the optimized minimum-transaction settlement plan,
 * and allows users to filter and drill down into individual expense breakdowns.
 * 
 * Requirements:
 * 1. Net Balance Table:
 *    - Columns: Member name, Total paid, Total owed, Net.
 *    - Green indicator for positive net, Red for negative.
 *    - Clickable member names to show their contributing logs (Filter by member).
 * 2. Settlement Plan:
 *    - Header: "Who pays whom to settle up".
 *    - Clicking a transaction loads the debtor's individual breakdown,
 *      revealing the specific expenses contributing to their debt (Rohan's requirement).
 * 3. Individual Breakdown:
 *    - Lists each expense the member was part of, their share, and whether paid/owed.
 */
export default function Balances() {
  const { id } = useParams(); // Group ID
  const [group, setGroup] = useState(null);
  const [balances, setBalances] = useState([]);
  const [settlementPlan, setSettlementPlan] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Drill-down states
  const [selectedUser, setSelectedUser] = useState(null); // { id, name }
  const [breakdownLog, setBreakdownLog] = useState([]);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  // Fetch overall balances and group info
  const fetchBalancesData = async () => {
    try {
      setError('');
      const groupRes = await api.get(`/api/groups/${id}`);
      setGroup(groupRes.data);

      const balancesRes = await api.get(`/api/groups/${id}/balances`);
      setBalances(balancesRes.data);

      const planRes = await api.get(`/api/groups/${id}/balances/settlement-plan`);
      setSettlementPlan(planRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch balances');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalancesData();
  }, [id]);

  // Fetch member breakdown logs when selectedUser changes
  useEffect(() => {
    if (!selectedUser) {
      setBreakdownLog([]);
      return;
    }

    const fetchBreakdown = async () => {
      setLoadingBreakdown(true);
      try {
        const response = await api.get(`/api/groups/${id}/balances/${selectedUser.id}`);
        setBreakdownLog(response.data);
      } catch (err) {
        console.error('Failed to fetch user breakdown logs', err);
      } finally {
        setLoadingBreakdown(false);
      }
    };

    fetchBreakdown();
  }, [selectedUser, id]);

  const formatCurrency = (amount) => {
    return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      {/* Page Header and Back Link */}
      <div className="flex items-center space-x-4 border-b border-slate-800 pb-5">
        <Link to={`/groups/${id}`} className="p-2 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors">
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100">Group Balances</h1>
          <p className="text-slate-400 text-sm">
            {group?.name ? `Balances and settlement plan for ${group.name}` : 'Net standing summary'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Columns: Net Balances Table (takes up 2 grid slots) */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold text-slate-200 flex items-center space-x-2">
            <Wallet className="h-5.5 w-5.5 text-indigo-400" />
            <span>Net Balance Summary</span>
          </h2>

          <div className="glass-panel overflow-hidden border border-slate-800/80 rounded-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-300 font-semibold text-sm">
                  <th className="py-4 px-6">Member Name</th>
                  <th className="py-4 px-6">Total Paid</th>
                  <th className="py-4 px-6">Total Owed</th>
                  <th className="py-4 px-6 text-right">Net standing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300 text-sm">
                {balances.map((row) => (
                  <tr
                    key={row.userId}
                    onClick={() => setSelectedUser({ id: row.userId, name: row.name })}
                    className={`hover:bg-slate-900/40 transition-colors cursor-pointer ${
                      selectedUser?.id === row.userId ? 'bg-indigo-600/10' : ''
                    }`}
                  >
                    <td className="py-4 px-6 font-semibold text-slate-200">
                      {row.name}
                      <p className="text-[10px] text-slate-500 font-normal">{row.email}</p>
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-300">
                      {formatCurrency(row.totalPaid)}
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-300">
                      {formatCurrency(row.totalOwed)}
                    </td>
                    <td className={`py-4 px-6 text-right font-bold ${
                      row.net > 0.01 ? 'text-emerald-400' : row.net < -0.01 ? 'text-rose-400' : 'text-slate-400'
                    }`}>
                      {row.net > 0.01 ? `+${formatCurrency(row.net)}` : formatCurrency(row.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 italic flex items-center space-x-1.5 px-1">
            <Info className="h-3.5 w-3.5 text-indigo-400" />
            <span>Click on a member name to view their detailed contributing expense breakdown.</span>
          </p>
        </div>

        {/* Right Column: Settlement Plan */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-slate-200 flex items-center space-x-2">
            <CheckCircle className="h-5.5 w-5.5 text-emerald-400" />
            <span>Who pays whom to settle up</span>
          </h2>

          <div className="glass-panel p-6 space-y-4">
            {settlementPlan.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-slate-400 font-medium">All balances are completely settled!</p>
                <p className="text-xs text-slate-500 mt-1">No transaction planning needed.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {settlementPlan.map((tx, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedUser({ id: tx.from, name: tx.fromName })}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-950/40 hover:bg-slate-800/50 border border-slate-800 rounded-xl transition-all text-left cursor-pointer group active:scale-[0.99]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        <span className="text-rose-400">{tx.fromName}</span> pays{' '}
                        <span className="text-emerald-400">{tx.toName}</span>
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Click to view details</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-base font-bold text-slate-200">{formatCurrency(tx.amount)}</span>
                      <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 italic flex items-center space-x-1.5 px-1">
            <Info className="h-3.5 w-3.5 text-emerald-400" />
            <span>Clicking a plan item opens the debtor's logs to explain why they owe money.</span>
          </p>
        </div>
      </div>

      {/* Drill-down: Member Breakdown Log Section */}
      {selectedUser && (
        <div className="glass-panel p-6 space-y-6 border border-slate-700/60 bg-slate-900/50 animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-xl font-bold text-slate-200">
                Detailed Expense Logs for <span className="gradient-text">{selectedUser.name}</span>
              </h3>
              <p className="text-slate-400 text-xs mt-1">
                Showing all expenses and settlements this member was involved in.
              </p>
            </div>
            <button
              onClick={() => setSelectedUser(null)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold text-slate-300 transition-all cursor-pointer"
            >
              Close Breakdown
            </button>
          </div>

          {loadingBreakdown ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
          ) : breakdownLog.length === 0 ? (
            <p className="text-slate-400 text-sm italic text-center py-8">
              No transactions recorded for this user in this group.
            </p>
          ) : (
            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    <th className="py-3 px-6">Date</th>
                    <th className="py-3 px-6">Description</th>
                    <th className="py-3 px-6">Type</th>
                    <th className="py-3 px-6">Payer</th>
                    <th className="py-3 px-6">Total Item Cost</th>
                    <th className="py-3 px-6">Your Share (Owed)</th>
                    <th className="py-3 px-6 text-right">Net Effect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300 text-sm">
                  {breakdownLog.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/30">
                      <td className="py-3.5 px-6 text-slate-400">
                        {new Date(item.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3.5 px-6 font-medium text-slate-200">
                        {item.description}
                      </td>
                      <td className="py-3.5 px-6">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.type === 'EXPENSE' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="py-3.5 px-6 text-slate-300">
                        {item.payerName}
                      </td>
                      <td className="py-3.5 px-6 text-slate-400">
                        {formatCurrency(item.totalAmount)}
                      </td>
                      <td className="py-3.5 px-6 font-semibold text-rose-400">
                        {item.owed > 0 ? `-${formatCurrency(item.owed)}` : '—'}
                      </td>
                      <td className={`py-3.5 px-6 text-right font-bold ${
                        item.netEffect > 0.01 ? 'text-emerald-400' : item.netEffect < -0.01 ? 'text-rose-400' : 'text-slate-400'
                      }`}>
                        {item.netEffect > 0.01 ? `+${formatCurrency(item.netEffect)}` : item.netEffect < -0.01 ? formatCurrency(item.netEffect) : '₹0.00'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
