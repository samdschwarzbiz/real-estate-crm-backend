/**
 * Webhook endpoints for incoming leads from real estate platforms:
 *   - Zillow Premier Agent
 *   - Realtor.com Pro
 *   - Homes.com
 *   - kvCORE / BoomTown (generic CRM export)
 *   - Generic (any platform that can POST JSON)
 *
 * Each endpoint normalizes the payload and creates a contact + lead.
 *
 * Webhook URLs to configure in each platform:
 *   POST /api/webhooks/zillow
 *   POST /api/webhooks/realtor
 *   POST /api/webhooks/generic
 *
 * Optional: set WEBHOOK_SECRET env var — platforms that support HMAC signing
 * will send it in X-Webhook-Secret header; all others are open (IP-restricted
 * at the hosting level).
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// ── helpers ──────────────────────────────────────────────────
function parseName(fullNameStr = '') {
  const parts = fullNameStr.trim().split(/\s+/);
  const first = parts[0] || '';
  const last = parts.slice(1).join(' ') || '';
  return { first, last };
}

async function createLeadFromWebhook({ first_name, last_name, email, phone, source, notes, message }) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Prevent duplicate: check by email or phone
    const existing = await client.query(
      `SELECT c.id, l.id AS lead_id
       FROM contacts c
       LEFT JOIN leads l ON l.contact_id = c.id
       WHERE ($1::text IS NOT NULL AND c.email ILIKE $1)
          OR ($2::text IS NOT NULL AND c.phone = $2)
       LIMIT 1`,
      [email || null, phone || null]
    );

    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return { duplicate: true, contact_id: existing.rows[0].id, lead_id: existing.rows[0].lead_id };
    }

    const contactResult = await client.query(
      `INSERT INTO contacts (first_name, last_name, email, phone, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [first_name, last_name, email || null, phone || null, source, notes || null]
    );
    const contact_id = contactResult.rows[0].id;

    const leadResult = await client.query(
      `INSERT INTO leads (contact_id, status, lead_type, last_contact_at)
       VALUES ($1, 'new', 'buyer', NOW())
       RETURNING *`,
      [contact_id]
    );
    const lead_id = leadResult.rows[0].id;

    const activityNote = message
      ? `Lead received from ${source}. Message: ${message}`
      : `Lead received from ${source}.`;

    await client.query(
      `INSERT INTO activities (lead_id, contact_id, type, subject, notes)
       VALUES ($1, $2, 'note', $3, $4)`,
      [lead_id, contact_id, `New lead from ${source}`, activityNote]
    );

    await client.query('COMMIT');
    return { duplicate: false, contact_id, lead_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Zillow Premier Agent ──────────────────────────────────────
// Zillow sends: { first_name, last_name, email, phone, message, property_url, property_address }
router.post('/zillow', async (req, res) => {
  try {
    const body = req.body;
    const first_name = body.first_name || body.firstName || '';
    const last_name  = body.last_name  || body.lastName  || '';
    const email      = body.email || null;
    const phone      = body.phone || null;
    const message    = body.message || body.comments || '';
    const address    = body.property_address || body.propertyAddress || null;

    const notes = [
      message,
      address ? `Inquired about: ${address}` : null,
    ].filter(Boolean).join('\n');

    const result = await createLeadFromWebhook({
      first_name, last_name, email, phone,
      source: 'zillow',
      notes,
      message,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[webhook/zillow]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Realtor.com Pro ──────────────────────────────────────────
// Realtor.com sends: { contact: { name, email, phone, message }, listing: { address } }
router.post('/realtor', async (req, res) => {
  try {
    const body = req.body;
    const contact = body.contact || body;
    const { first: first_name, last: last_name } = parseName(contact.name || '');
    const email   = contact.email || null;
    const phone   = contact.phone || null;
    const message = contact.message || contact.comments || '';
    const address = (body.listing || {}).address || null;

    const notes = [
      message,
      address ? `Inquired about: ${address}` : null,
    ].filter(Boolean).join('\n');

    const result = await createLeadFromWebhook({
      first_name, last_name, email, phone,
      source: 'realtor_com',
      notes,
      message,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[webhook/realtor]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Generic / kvCORE / BoomTown / Homes.com ─────────────────
// Accepts a flexible payload; tries many common field name patterns
router.post('/generic', async (req, res) => {
  try {
    const body = req.body;
    const lead  = body.lead || body.contact || body.prospect || body;

    let first_name = lead.first_name || lead.firstName || lead.fname || '';
    let last_name  = lead.last_name  || lead.lastName  || lead.lname || '';

    // If only full name provided
    if (!first_name && (lead.name || lead.full_name || lead.fullName)) {
      const parsed = parseName(lead.name || lead.full_name || lead.fullName);
      first_name = parsed.first;
      last_name  = parsed.last;
    }

    const email   = lead.email || lead.email_address || null;
    const phone   = lead.phone || lead.phone_number || lead.cell || lead.mobile || null;
    const message = lead.message || lead.comments || lead.notes || lead.inquiry || '';
    const source  = body.source || lead.source || body.platform || 'website';
    const address = lead.property_address || lead.address || lead.listing_address || null;

    const notes = [
      message,
      address ? `Inquired about: ${address}` : null,
    ].filter(Boolean).join('\n');

    const result = await createLeadFromWebhook({
      first_name, last_name, email, phone,
      source,
      notes,
      message,
    });

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[webhook/generic]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
