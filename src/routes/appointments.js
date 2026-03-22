const express = require('express');
const router = express.Router();
const db = require('../db');
const { syncAppointmentToGoogle, deleteGoogleEvent } = require('../services/google-calendar');

// GET / - list appointments with optional filters
router.get('/', async (req, res) => {
  try {
    const { from, to, status } = req.query;
    const conditions = [];
    const params = [];

    if (from) {
      params.push(from);
      conditions.push(`a.scheduled_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`a.scheduled_at <= $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db.query(`
      SELECT
        a.*,
        c.first_name,
        c.last_name,
        c.phone,
        c.email
      FROM appointments a
      LEFT JOIN contacts c ON c.id = a.contact_id
      ${where}
      ORDER BY a.scheduled_at ASC
    `, params);

    res.json(result.rows);
  } catch (err) {
    console.error('GET /appointments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST / - create appointment
router.post('/', async (req, res) => {
  try {
    const {
      contact_id, lead_id, type, title, property_address,
      scheduled_at, duration_min, notes, status,
    } = req.body;

    const result = await db.query(`
      INSERT INTO appointments
        (contact_id, lead_id, type, title, property_address, scheduled_at, duration_min, notes, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      contact_id || null,
      lead_id || null,
      type || 'showing',
      title || null,
      property_address || null,
      scheduled_at,
      duration_min || 60,
      notes || null,
      status || 'scheduled',
    ]);

    const appt = result.rows[0];

    // Try Google Calendar sync (non-fatal if not configured)
    try {
      const googleEventId = await syncAppointmentToGoogle(appt);
      if (googleEventId) {
        await db.query(
          'UPDATE appointments SET google_event_id = $1 WHERE id = $2',
          [googleEventId, appt.id]
        );
        appt.google_event_id = googleEventId;
      }
    } catch (gcErr) {
      console.log('Google Calendar sync skipped:', gcErr.message);
    }

    res.status(201).json(appt);
  } catch (err) {
    console.error('POST /appointments error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id - update appointment
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;

    const allowed = [
      'contact_id', 'lead_id', 'type', 'title', 'property_address',
      'scheduled_at', 'duration_min', 'notes', 'status', 'reminder_sent',
    ];

    const setClauses = [];
    const params = [];

    for (const key of allowed) {
      if (key in fields) {
        params.push(fields[key]);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push('updated_at = NOW()');
    params.push(id);

    const result = await db.query(`
      UPDATE appointments
      SET ${setClauses.join(', ')}
      WHERE id = $${params.length}
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appt = result.rows[0];

    // Try Google Calendar sync (non-fatal)
    try {
      const googleEventId = await syncAppointmentToGoogle(appt);
      if (googleEventId && googleEventId !== appt.google_event_id) {
        await db.query(
          'UPDATE appointments SET google_event_id = $1 WHERE id = $2',
          [googleEventId, appt.id]
        );
        appt.google_event_id = googleEventId;
      }
    } catch (gcErr) {
      console.log('Google Calendar sync skipped:', gcErr.message);
    }

    res.json(appt);
  } catch (err) {
    console.error('PATCH /appointments/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - delete appointment
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const appt = existing.rows[0];

    // Try Google Calendar delete (non-fatal)
    if (appt.google_event_id) {
      try {
        await deleteGoogleEvent(appt.google_event_id);
      } catch (gcErr) {
        console.log('Google Calendar delete skipped:', gcErr.message);
      }
    }

    await db.query('DELETE FROM appointments WHERE id = $1', [id]);

    res.json({ success: true, id: parseInt(id) });
  } catch (err) {
    console.error('DELETE /appointments/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
