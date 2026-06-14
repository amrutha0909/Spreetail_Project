module.exports = (err, req, res, next) => {
  console.error('[Error Handler] Caught error:', err);

  const status = err.status || 500;
  const message = err.message || 'An internal server error occurred';

  res.status(status).json({
    error: message,
    // only expose details in development if needed, but per rule: "never let raw errors reach client"
  });
};
