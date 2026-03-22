require('dotenv').config();
const express = require('express');
const cors = require('cors');

const dashboardRoutes = require('./routes/dashboard');
const leadsRoutes = require('./routes/leads');
const contactsRoutes = require('./routes/contacts');
const activitiesRoutes = require('./routes/activities');
const transactionsRoutes = require('./routes/transactions');
const webhookRoutes = require('./routes/webhook');
const propertiesRoutes = require('./routes/properties');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://frontend-tawny-rho-40.vercel.app',
    ];
    if (!origin || allowed.includes(origin) || (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/properties', propertiesRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🏠 Real Estate CRM API running on port ${PORT}`);
});
