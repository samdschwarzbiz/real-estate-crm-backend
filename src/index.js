require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { checkBirthdays, checkAnniversaries, checkFollowUps, sendTestEmail, checkAppointments } = require('./services/reminders');

const dashboardRoutes = require('./routes/dashboard');
const leadsRoutes = require('./routes/leads');
const contactsRoutes = require('./routes/contacts');
const activitiesRoutes = require('./routes/activities');
const transactionsRoutes = require('./routes/transactions');
const webhookRoutes = require('./routes/webhook');
const propertiesRoutes = require('./routes/properties');
const appointmentsRoutes = require('./routes/appointments');
const googleAuthRoutes = require('./routes/google-auth');
const searchRoutes = require('./routes/search');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:4173',
      'https://frontend-tawny-rho-40.vercel.app',
      'https://crm.samschwarzhomes.com',
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
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/google', googleAuthRoutes);
app.use('/api/search', searchRoutes);

// Manual trigger endpoint for reminders
app.post('/api/reminders/send-now', async (req, res) => {
  try {
    await checkFollowUps();
    await checkBirthdays();
    await checkAnniversaries();
    res.json({ success: true, message: 'Reminder emails sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test email endpoint
app.post('/api/reminders/test', async (req, res) => {
  try {
    await sendTestEmail();
    res.json({ success: true, message: 'Test email sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Daily reminder cron (8:00 AM Arizona time = 15:00 UTC) ──
cron.schedule('0 15 * * *', async () => {
  console.log('🔔 Running daily reminders...');
  await checkFollowUps();
  await checkBirthdays();
  await checkAnniversaries();
  await checkAppointments();
});

app.listen(PORT, () => {
  console.log(`🏠 Real Estate CRM API running on port ${PORT}`);
});
