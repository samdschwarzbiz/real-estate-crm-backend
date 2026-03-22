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

module.exports = router;
