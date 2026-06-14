import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import { Users, Plus, ArrowLeft, Wallet, Receipt, Calendar, UserMinus, UserPlus, Info, Edit } from 'lucide-react';
import ExpenseForm from '../components/ExpenseForm';

/**
 * GroupDetail Component
 * 
 * Purpose:
 * Renders the detail view of an individual group. It shows members (active and departed),
 * lists all expenses in a clean table layout, and provides forms to add members
 * with dynamic join dates and remove members with dynamic left dates.
 * 
 * Requirements:
 * - Time-bounded memberships (users join and leave with effective dates).
 * - Multi-currency formatting (display original USD amount and exchange rate alongside the INR conversion).
 * - Tables for scanability over card layouts.
 * - Controls to launch Balances, Settlement Plan, and direct settlements.
 */
export default function GroupDetail() {
  const { id } = useParams(); // Gets group ID from route parameters
  
  // State variables for data and indicators
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // State variables for adding a new member
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberJoinDate, setMemberJoinDate] = useState(new Date().toISOString().split('T')[0]);
  const [memberSubmitting, setMemberSubmitting] = useState(false);

  // State variables for marking a member as left (departure dates)
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false);
  const [selectedRemoveMember, setSelectedRemoveMember] = useState(null);
  const [memberLeaveDate, setMemberLeaveDate] = useState(new Date().toISOString().split('T')[0]);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  // Controls displaying the Add Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  // State variables for editing a member's join date
  const [showEditMemberModal, setShowEditMemberModal] = useState(false);
  const [selectedEditMember, setSelectedEditMember] = useState(null);
  const [memberEditJoinDate, setMemberEditJoinDate] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  /**
   * fetchData
   * 
   * Purpose:
   * Fetches group details (with members) and expense items for this group from backend.
   */
  const fetchData = async () => {
    try {
      setError('');
      // Fetch group detail (with memberships)
      const groupRes = await api.get(`/api/groups/${id}`);
      setGroup(groupRes.data);

      // Fetch expenses for this group
      try {
        const expensesRes = await api.get(`/api/groups/${id}/expenses`);
        setExpenses(expensesRes.data);
      } catch (err) {
        // Fallback to empty list if endpoint is not implemented/ready yet
        setExpenses([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch group details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Trigger data fetch when Group ID changes
  useEffect(() => {
    fetchData();
  }, [id]);

  /**
   * handleAddMember
   * 
   * Purpose:
   * Handles submitting the Add Member form.
   * Sends the user's email and joining date to `/api/groups/:id/members`.
   */
  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!memberEmail) return;
    setMemberSubmitting(true);
    setError('');

    try {
      await api.post(`/api/groups/${id}/members`, {
        email: memberEmail,
        joinedAt: new Date(memberJoinDate).toISOString()
      });
      setMemberEmail('');
      setMemberJoinDate(new Date().toISOString().split('T')[0]);
      setShowAddMemberModal(false);
      await fetchData(); // Refresh details
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add member');
    } finally {
      setMemberSubmitting(false);
    }
  };

  /**
   * handleOpenRemoveModal
   * 
   * Purpose:
   * Prepares and opens the departure modal for a selected member.
   */
  const handleOpenRemoveModal = (member) => {
    setSelectedRemoveMember(member);
    setMemberLeaveDate(new Date().toISOString().split('T')[0]);
    setShowRemoveMemberModal(true);
  };

  /**
   * handleRemoveMember
   * 
   * Purpose:
   * Handles submitting the member departure (leftAt) date update.
   * Sends patch request to `/api/groups/:id/members/:userId` to restrict future balances.
   */
  const handleRemoveMember = async (e) => {
    e.preventDefault();
    if (!selectedRemoveMember) return;
    setRemoveSubmitting(true);
    setError('');

    try {
      await api.patch(`/api/groups/${id}/members/${selectedRemoveMember.id}`, {
        leftAt: new Date(memberLeaveDate).toISOString()
      });
      setSelectedRemoveMember(null);
      setShowRemoveMemberModal(false);
      await fetchData(); // Refresh details
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to mark member as departed');
    } finally {
      setRemoveSubmitting(false);
    }
  };

  /**
   * handleOpenEditModal
   * 
   * Purpose:
   * Prepares and opens the edit join date modal for a selected member.
   */
  const handleOpenEditModal = (member) => {
    setSelectedEditMember(member);
    const formattedDate = new Date(member.joinedAt).toISOString().split('T')[0];
    setMemberEditJoinDate(formattedDate);
    setShowEditMemberModal(true);
  };

  /**
   * handleEditMember
   * 
   * Purpose:
   * Updates the member's joinedAt date.
   */
  const handleEditMember = async (e) => {
    e.preventDefault();
    if (!selectedEditMember) return;
    setEditSubmitting(true);
    setError('');

    try {
      await api.patch(`/api/groups/${id}/members/${selectedEditMember.id}`, {
        joinedAt: new Date(memberEditJoinDate).toISOString()
      });
      setSelectedEditMember(null);
      setShowEditMemberModal(false);
      await fetchData(); // Refresh details
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update entry date');
    } finally {
      setEditSubmitting(false);
    }
  };

  /**
   * formatAmount
   * 
   * Purpose:
   * Formats numbers to 2 decimal places and handles USD currency display rules.
   * e.g., ₹44,946.60 ($540 @ ₹83.23)
   */
  const formatAmount = (amount, currency, rate) => {
    const amt = Number(amount);
    if (currency === 'USD') {
      const inrAmt = (amt * Number(rate || 83.5)).toFixed(2);
      return `₹${Number(inrAmt).toLocaleString('en-IN')} ($${amt} @ ₹${rate})`;
    }
    return `₹${amt.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error && !group) {
    return (
      <div className="space-y-4 max-w-md mx-auto text-center py-12">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
        <Link to="/" className="inline-flex items-center space-x-2 text-indigo-400 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner and Navigation Buttons */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div className="flex items-center space-x-4">
          <Link to="/" className="p-2 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors">
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Link>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-100">{group.name}</h1>
            <p className="text-slate-400 text-sm">{group.description || 'No description'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Link
            to={`/groups/${group.id}/balances`}
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-sm font-semibold transition-colors"
          >
            <Wallet className="h-4.5 w-4.5 text-indigo-400" />
            <span>Balances & Settlement Plan</span>
          </Link>
          <Link
            to={`/groups/${group.id}/settlements`}
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-sm font-semibold transition-colors"
          >
            <Receipt className="h-4.5 w-4.5 text-emerald-400" />
            <span>Settle Debts</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Section — Expense listing in tabular format */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-200">Expenses</h2>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="gradient-btn flex items-center space-x-2 py-2 px-4 text-sm cursor-pointer"
            >
              <Plus className="h-4.5 w-4.5" />
              <span>Add Expense</span>
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="glass-panel text-center py-20 px-6">
              <Receipt className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-300">No expenses recorded</h3>
              <p className="text-slate-400 mt-1 text-sm max-w-sm mx-auto">
                Keep track of shares by logging flatmate purchases or importing the CSV.
              </p>
            </div>
          ) : (
            // Clean table layout for scanability (Rohan/Meera's requirement)
            <div className="glass-panel overflow-hidden border border-slate-800/80 rounded-2xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-900/40 text-slate-300 font-semibold text-sm">
                      <th className="py-4 px-6">Date</th>
                      <th className="py-4 px-6">Description</th>
                      <th className="py-4 px-6">Paid By</th>
                      <th className="py-4 px-6">Amount</th>
                      <th className="py-4 px-6">Split Type</th>
                      <th className="py-4 px-6">Participants</th>
                      <th className="py-4 px-6 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 text-sm">
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-4 px-6 text-slate-400">
                          {new Date(expense.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="py-4 px-6">
                          <p className="font-semibold text-slate-200">{expense.description}</p>
                          {expense.notes && <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-1">{expense.notes}</p>}
                        </td>
                        <td className="py-4 px-6 text-slate-200 font-medium">
                          {expense.paidBy?.name}
                        </td>
                        <td className="py-4 px-6 text-slate-200 font-bold">
                          {formatAmount(expense.amount, expense.currency, expense.exchangeRate)}
                        </td>
                        <td className="py-4 px-6">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                            {expense.splitType}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-400">
                          {expense.splits?.map(s => s.user?.name).join(', ')}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <Link
                            to={`/groups/${group.id}/expenses/${expense.id}`}
                            className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-800 hover:bg-indigo-600 border border-slate-700 hover:border-indigo-500 rounded-lg text-xs font-semibold text-slate-300 hover:text-white transition-all"
                          >
                            <Info className="h-3.5 w-3.5" />
                            <span>View</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Section — Members list and time-bounded memberships tracking */}
        <div className="space-y-6">
          <div className="glass-panel p-6 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-200 flex items-center space-x-2">
                <Users className="h-5 w-5 text-indigo-400" />
                <span>Flat Members</span>
              </h3>
              <button
                onClick={() => setShowAddMemberModal(true)}
                className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 border border-transparent hover:border-slate-700 transition-colors cursor-pointer"
                title="Add Member"
              >
                <UserPlus className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="space-y-4">
              {group.members.map((member) => (
                <div key={member.id} className="flex items-start justify-between group">
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-semibold text-slate-200">{member.name}</p>
                      {member.leftAt ? (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-medium">
                          Departed
                        </span>
                      ) : (
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-500/20 font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{member.email}</p>
                    <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 mt-1">
                      <Calendar className="h-3 w-3" />
                      <span>Joined: {new Date(member.joinedAt).toLocaleDateString('en-IN')}</span>
                    </div>
                    {member.leftAt && (
                      <div className="flex items-center space-x-1.5 text-[10px] text-rose-500/80 mt-0.5">
                        <Calendar className="h-3 w-3" />
                        <span>Left: {new Date(member.leftAt).toLocaleDateString('en-IN')}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Button to edit entry/join date */}
                    <button
                      onClick={() => handleOpenEditModal(member)}
                      className="p-1 hover:bg-indigo-500/10 rounded-lg text-slate-500 hover:text-indigo-400 border border-transparent hover:border-indigo-500/30 transition-colors cursor-pointer"
                      title="Edit Entry Date"
                    >
                      <Edit className="h-4 w-4" />
                    </button>

                    {/* Button to log departure date for active members */}
                    {!member.leftAt && (
                      <button
                        onClick={() => handleOpenRemoveModal(member)}
                        className="p-1 hover:bg-rose-500/10 rounded-lg text-slate-500 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-colors cursor-pointer"
                        title="Set Departure Date"
                      >
                        <UserMinus className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal popup to add a new member by email */}
      {showAddMemberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-bold text-slate-200 mb-6 flex items-center space-x-2">
              <UserPlus className="h-5 w-5 text-indigo-400" />
              <span>Add Group Member</span>
            </h2>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="memberEmail">
                  User Email Address
                </label>
                <input
                  id="memberEmail"
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="flatmate@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="memberJoinDate">
                  Joining Effective Date
                </label>
                <input
                  id="memberJoinDate"
                  type="date"
                  value={memberJoinDate}
                  onChange={(e) => setMemberJoinDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberSubmitting}
                  className="gradient-btn text-sm flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {memberSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span>Add Member</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal popup to record a member departure date */}
      {showRemoveMemberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-bold text-slate-200 mb-2 flex items-center space-x-2">
              <UserMinus className="h-5 w-5 text-rose-400" />
              <span>Mark Member as Departed</span>
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Set the date when <strong className="text-slate-200">{selectedRemoveMember?.name}</strong> left the flat. They will not be included in expenses dated after this date.
            </p>
            <form onSubmit={handleRemoveMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="memberLeaveDate">
                  Departure Effective Date
                </label>
                <input
                  id="memberLeaveDate"
                  type="date"
                  value={memberLeaveDate}
                  onChange={(e) => setMemberLeaveDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setShowRemoveMemberModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={removeSubmitting}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-rose-600/20 active:scale-[0.98] cursor-pointer"
                >
                  {removeSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span>Confirm Departure</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal popup to edit member entry/join date */}
      {showEditMemberModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-xl font-bold text-slate-200 mb-2 flex items-center space-x-2">
              <Edit className="h-5 w-5 text-indigo-400" />
              <span>Edit Entry Date</span>
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              Manually update the entry join date for <strong className="text-slate-200">{selectedEditMember?.name}</strong>.
            </p>
            <form onSubmit={handleEditMember} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="memberEditJoinDate">
                  Joining Effective Date
                </label>
                <input
                  id="memberEditJoinDate"
                  type="date"
                  value={memberEditJoinDate}
                  onChange={(e) => setMemberEditJoinDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  required
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setShowEditMemberModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="gradient-btn text-sm flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {editSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Renders the add expense modal/form overlay */}
      {showExpenseModal && (
        <ExpenseForm
          group={group}
          onClose={() => setShowExpenseModal(false)}
          onSuccess={async () => {
            setShowExpenseModal(false);
            await fetchData();
          }}
        />
      )}
    </div>
  );
}
