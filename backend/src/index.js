require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const expenseRoutes = require('./routes/expenses');
const balanceRoutes = require('./routes/balances');
const settlementRoutes = require('./routes/settlements');
const importRoutes = require('./routes/import');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing and cookies
app.use(express.json());
app.use(cookieParser());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../public')));

// Route mounts
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups/:groupId/expenses', expenseRoutes);
app.use('/api/groups/:groupId/balances', balanceRoutes);
app.use('/api/groups/:groupId/settlements', settlementRoutes);
app.use('/api/import', importRoutes);

// Root test endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// All non-API routes serve index.html (React Router handles them)
app.get('/*splat', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
  }
});

// Global error handler
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
