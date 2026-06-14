import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import ExpenseDetail from './pages/ExpenseDetail';
import Balances from './pages/Balances';
import Import from './pages/Import';
import Settlements from './pages/Settlements';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppContent() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {user && <Navbar />}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          <Route path="/groups/:id" element={
            <ProtectedRoute>
              <GroupDetail />
            </ProtectedRoute>
          } />
          <Route path="/groups/:id/expenses/:eid" element={
            <ProtectedRoute>
              <ExpenseDetail />
            </ProtectedRoute>
          } />
          <Route path="/groups/:id/balances" element={
            <ProtectedRoute>
              <Balances />
            </ProtectedRoute>
          } />
          <Route path="/groups/:id/settlements" element={
            <ProtectedRoute>
              <Settlements />
            </ProtectedRoute>
          } />
          <Route path="/import" element={
            <ProtectedRoute>
              <Import />
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
