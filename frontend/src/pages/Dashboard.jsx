import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { Users, Plus, FileSpreadsheet, FolderPlus, ArrowRight } from 'lucide-react';

/**
 * Dashboard Component
 * 
 * Purpose:
 * Renders the main entry point for logged-in users.
 * Displays all expense groups the user belongs to and provides functionality to create a new group.
 * 
 * Requirements:
 * - Fetches groups list from `/api/groups`.
 * - Shows name, description, currency, and members of each group.
 * - Restricts access to authenticated users (via ProtectedRoute wrapper).
 * - Displays a grid/list of groups.
 * - Integrates navigation to the CSV import utility and detailed group view.
 */
export default function Dashboard() {
  // State to hold groups fetched from backend
  const [groups, setGroups] = useState([]);
  
  // Loading state for API fetching indicator
  const [loading, setLoading] = useState(true);
  
  // Holds any fetching/saving errors to display to the user
  const [error, setError] = useState('');
  
  // Controls visibility of the "Create Group" modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  // Form states for creating a new group
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('INR'); // Default group currency is INR
  
  // Loading state for group creation submit button
  const [submitting, setSubmitting] = useState(false);

  /**
   * fetchGroups
   * 
   * Purpose:
   * Retrieves groups where the current user is registered as a member from the database.
   * Updates local state or displays errors.
   */
  const fetchGroups = async () => {
    try {
      const response = await api.get('/api/groups');
      setGroups(response.data);
    } catch (err) {
      setError('Failed to fetch groups.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch groups list on initial page mount
  useEffect(() => {
    fetchGroups();
  }, []);

  /**
   * handleCreateGroup
   * 
   * Purpose:
   * Handles submission of the "Create Group" form.
   * Invokes POST /api/groups and automatically registers the creator as a group member.
   */
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!name) return;
    setSubmitting(true);
    setError('');

    try {
      await api.post('/api/groups', { name, description, currency });
      // Reset form fields
      setName('');
      setDescription('');
      setCurrency('INR');
      setShowCreateModal(false);
      // Reload groups list to include the newly created group
      await fetchGroups();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Dashboard Top Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-100">Welcome to FlatShare</h1>
          <p className="text-slate-400 mt-1">Split expenses easily with flatmates and guests.</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Link to CSV Import Page */}
          <Link
            to="/import"
            className="flex items-center space-x-2 px-4 py-2.5 bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-sm font-medium transition-colors"
          >
            <FileSpreadsheet className="h-4.5 w-4.5 text-indigo-400" />
            <span>Import CSV</span>
          </Link>
          {/* Button to open Create Group Modal */}
          <button
            onClick={() => setShowCreateModal(true)}
            className="gradient-btn flex items-center space-x-2 py-2.5 px-4 cursor-pointer text-sm"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>Create Group</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
      ) : groups.length === 0 ? (
        // Empty State UI
        <div className="glass-panel text-center py-20 px-6">
          <Users className="h-16 w-16 text-slate-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-200">No groups found</h3>
          <p className="text-slate-400 mt-2 max-w-sm mx-auto">
            You are not part of any expense groups yet. Create one above to get started!
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="gradient-btn mt-6 inline-flex items-center space-x-2 cursor-pointer text-sm"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>Create a Group</span>
          </button>
        </div>
      ) : (
        // Groups Grid Layout
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => (
            <div key={group.id} className="glass-card flex flex-col justify-between p-6">
              <div>
                <div className="flex items-start justify-between">
                  <div className="bg-indigo-600/10 p-2.5 rounded-xl border border-indigo-500/20">
                    <Users className="h-5 w-5 text-indigo-400" />
                  </div>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-800/80 px-2 py-1 rounded-md">
                    {group.currency}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-200 mt-4 line-clamp-1">{group.name}</h3>
                <p className="text-slate-400 mt-2 text-sm line-clamp-2 min-h-[40px]">
                  {group.description || 'No description provided.'}
                </p>
                {/* Horizontal Divider and Members List Avatar Stack */}
                <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                  <span>Members:</span>
                  <div className="flex -space-x-2 overflow-hidden">
                    {group.members.slice(0, 4).map((member) => (
                      <div
                        key={member.id}
                        className="inline-block h-6 w-6 rounded-full bg-slate-700 border border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-200"
                        title={member.name}
                      >
                        {member.name.charAt(0)}
                      </div>
                    ))}
                    {group.members.length > 4 && (
                      <div className="inline-block h-6 w-6 rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-400">
                        +{group.members.length - 4}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <Link
                  to={`/groups/${group.id}`}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 rounded-xl text-sm font-semibold transition-all group"
                >
                  <span>View Details</span>
                  <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Group Modal Form Popup */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass-panel w-full max-w-md p-6 bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <h2 className="text-2xl font-bold text-slate-200 mb-6">Create New Group</h2>
            <form onSubmit={handleCreateGroup} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="groupName">
                  Group Name
                </label>
                <input
                  id="groupName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="e.g. Flat 302 Expenses"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="groupDesc">
                  Description
                </label>
                <textarea
                  id="groupDesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors h-24 resize-none"
                  placeholder="What is this group for?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5" htmlFor="groupCurrency">
                  Default Currency
                </label>
                <select
                  id="groupCurrency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-6">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
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
                    <>
                      <FolderPlus className="h-4.5 w-4.5" />
                      <span>Create</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
