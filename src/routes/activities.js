const express = require('express');
const router = express.Router();
const db = require('../db');

// POST /api/activities  — log an activity on a lead
router.post('/', async (req, res) => {
  try {
    const { lead_id, contact_id, type, subject, notes, duration_min, outcome } = req.body;
    if (!lead_id || !type) return res.status(400).json({ error: 'lead_id and type required' });

    const result = await db.query(`
      INSERT INTO activities (lead_id, contact_id, type, subject, notes, duration_min, outcome)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [lead_id, contact_id || null, type, subject || null, notes || null, duration_min || null, outcome || null]);

    // Update last_contact_at on the lead
    await db.query(
      `UPDATE leads SET last_contact_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [lead_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/activities/lead/:leadId
router.get('/lead/:leadId', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM activities WHERE lead_id = $1 ORDER BY created_at DESC
    `, [req.params.leadId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/activities/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM activities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
