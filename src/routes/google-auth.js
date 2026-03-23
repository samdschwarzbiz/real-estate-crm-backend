const express = require('express');
const router = express.Router();
const { getAuthUrl, exchangeCodeForTokens, isConnected } = require('../services/google-calendar');

// GET /api/google/status
router.get('/status', async (req, res) => {
  const connected = await isConnected();
  res.json({ connected });
});

// GET /api/google/auth-url
router.get('/auth-url', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(400).json({ error: 'Google OAuth not configured' });
  }
  const url = getAuthUrl();
  res.json({ url });
});

// GET /api/google/connect  — direct redirect (no JS async needed)
router.get('/connect', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(400).send('Google OAuth not configured');
  }
  const url = getAuthUrl();
  res.redirect(url);
});

// GET /api/google/callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Missing code');
    await exchangeCodeForTokens(code);
    const frontendUrl = process.env.FRONTEND_URL || 'https://crm.samschwarzhomes.com';
    res.redirect(`${frontendUrl}/schedule?google=connected`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.status(500).send('OAuth error: ' + err.message);
  }
});

// GET /api/google/birthdays  — upcoming birthdays from Google Calendar
router.get('/birthdays', async (req, res) => {
  try {
    const { getAuthorizedClient } = require('../services/google-calendar');
    const auth = await getAuthorizedClient();
    const { google } = require('googleapis');
    const calendar = google.calendar({ version: 'v3', auth });

    // List all calendars to find the Birthdays calendar
    const calList = await calendar.calendarList.list();
    const birthdayCal = calList.data.items.find(c =>
      c.summary && (
        c.summary.toLowerCase().includes('birthday') ||
        c.id.includes('birthday') ||
        c.id.includes('contacts')
      )
    );

    if (!birthdayCal) {
      return res.json([]);
    }

    const now = new Date();
    const in60days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

    const events = await calendar.events.list({
      calendarId: birthdayCal.id,
      timeMin: now.toISOString(),
      timeMax: in60days.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const results = (events.data.items || []).map(e => {
      const dateStr = e.start.date || e.start.dateTime?.slice(0, 10);
      const today = new Date().toISOString().slice(0, 10);
      const days = Math.ceil((new Date(dateStr) - new Date(today)) / 86400000);
      return {
        id: e.id,
        name: e.summary?.replace(/['']s birthday/i, '').replace(/birthday/i, '').trim() || e.summary,
        date: dateStr,
        days_until: days,
        source: 'google_calendar',
      };
    });

    res.json(results);
  } catch (err) {
    // If not connected or error, return empty array gracefully
    console.error('[google/birthdays]', err.message);
    res.json([]);
  }
});

module.exports = router;
