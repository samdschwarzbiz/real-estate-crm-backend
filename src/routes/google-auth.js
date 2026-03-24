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

// GET /api/google/events?days=30  — all events from primary Google Calendar
router.get('/events', async (req, res) => {
  try {
    const { getAuthorizedClient } = require('../services/google-calendar');
    const auth = await getAuthorizedClient();
    const { google } = require('googleapis');
    const calendar = google.calendar({ version: 'v3', auth });

    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Fetch from all calendars the user owns/subscribes to (skip birthdays & holidays)
    const calList = await calendar.calendarList.list();
    const cals = (calList.data.items || []).filter(c => {
      const s = (c.summary || '').toLowerCase();
      return !s.includes('holiday') && !s.includes('birthday') && !c.id.includes('holiday');
    });

    const allEvents = [];
    await Promise.all(cals.map(async (cal) => {
      try {
        const resp = await calendar.events.list({
          calendarId: cal.id,
          timeMin: now.toISOString(),
          timeMax: future.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 50,
        });
        for (const e of resp.data.items || []) {
          if (!e.summary) continue;
          allEvents.push({
            id: e.id,
            title: e.summary,
            start: e.start.dateTime || e.start.date,
            end: e.end?.dateTime || e.end?.date,
            all_day: !!e.start.date,
            calendar: cal.summary,
            calendar_color: cal.backgroundColor || null,
            location: e.location || null,
            description: e.description || null,
            source: 'google_calendar',
          });
        }
      } catch { /* skip calendars we can't read */ }
    }));

    // Sort by start time
    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
    res.json(allEvents);
  } catch (err) {
    console.error('[google/events]', err.message);
    res.json([]);
  }
});

module.exports = router;
