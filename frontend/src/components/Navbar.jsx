import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, LayoutDashboard, FileSpreadsheet, Sparkles } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center space-x-3">
        <div className="bg-indigo-600/20 p-2 rounded-xl border border-indigo-500/30">
          <Sparkles className="h-6 w-6 text-indigo-400" />
        </div>
        <Link to="/" className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          FlatShare
        </Link>
      </div>

      <div className="flex items-center space-x-6">
        <Link to="/" className="flex items-center space-x-1.5 text-slate-300 hover:text-indigo-400 font-medium transition-colors">
          <LayoutDashboard className="h-4.5 w-4.5" />
          <span>Dashboard</span>
        </Link>
        <Link to="/import" className="flex items-center space-x-1.5 text-slate-300 hover:text-indigo-400 font-medium transition-colors">
          <FileSpreadsheet className="h-4.5 w-4.5" />
          <span>Import CSV</span>
        </Link>
      </div>

      <div className="flex items-center space-x-4">
        <div className="text-right">
          <p className="text-sm font-semibold text-slate-200">{user.name}</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/40 text-rose-400 rounded-lg text-sm transition-all cursor-pointer active:scale-[0.98]"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </nav>
  );
}
