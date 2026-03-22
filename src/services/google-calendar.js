const { google } = require('googleapis');
const db = require('../db');

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://real-estate-crm-backend-8h1x.onrender.com/api/google/callback'
  );
}

async function getAuthorizedClient() {
  const result = await db.query('SELECT * FROM google_tokens ORDER BY id DESC LIMIT 1');
  if (!result.rows.length) throw new Error('Google Calendar not connected');
  const tokens = result.rows[0];
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });
  // Auto-refresh
  oauth2Client.on('tokens', async (newTokens) => {
    await db.query(
      'UPDATE google_tokens SET access_token = $1, expiry_date = $2, updated_at = NOW() WHERE id = $3',
      [newTokens.access_token, newTokens.expiry_date, tokens.id]
    );
  });
  return oauth2Client;
}

function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  // Store in DB
  const existing = await db.query('SELECT id FROM google_tokens LIMIT 1');
  if (existing.rows.length) {
    await db.query(
      'UPDATE google_tokens SET access_token = $1, refresh_token = $2, expiry_date = $3, updated_at = NOW() WHERE id = $4',
      [tokens.access_token, tokens.refresh_token, tokens.expiry_date, existing.rows[0].id]
    );
  } else {
    await db.query(
      'INSERT INTO google_tokens (access_token, refresh_token, expiry_date) VALUES ($1, $2, $3)',
      [tokens.access_token, tokens.refresh_token, tokens.expiry_date]
    );
  }
  return tokens;
}

async function syncAppointmentToGoogle(appt) {
  if (!process.env.GOOGLE_CLIENT_ID) return null;
  const auth = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const startTime = new Date(appt.scheduled_at);
  const endTime = new Date(startTime.getTime() + (appt.duration_min || 60) * 60000);

  const typeLabels = {
    showing: 'Showing', walkthrough: 'Final Walk-Through', inspection: 'Inspection',
    closing: 'Closing', open_house: 'Open House', meeting: 'Meeting',
  };

  const summary = appt.title || `${typeLabels[appt.type] || appt.type}${appt.property_address ? ': ' + appt.property_address : ''}`;

  const event = {
    summary,
    location: appt.property_address || '',
    description: appt.notes || '',
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'email', minutes: 1440 }, // 24 hours before
      ],
    },
  };

  if (appt.google_event_id) {
    // Update existing
    await calendar.events.update({
      calendarId: 'primary',
      eventId: appt.google_event_id,
      resource: event,
    });
    return appt.google_event_id;
  } else {
    // Create new
    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    return res.data.id;
  }
}

async function deleteGoogleEvent(googleEventId) {
  if (!process.env.GOOGLE_CLIENT_ID) return;
  const auth = await getAuthorizedClient();
  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId });
}

async function isConnected() {
  try {
    const result = await db.query('SELECT id FROM google_tokens LIMIT 1');
    return result.rows.length > 0;
  } catch { return false; }
}

module.exports = { getAuthUrl, exchangeCodeForTokens, syncAppointmentToGoogle, deleteGoogleEvent, isConnected };
