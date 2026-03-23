const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/search?q=john
router.get('/', async (req, res) => {
  try {
    const { q = '' } = req.query;
    if (!q.trim() || q.trim().length < 2) return res.json({ leads: [], contacts: [] });

    const term = `%${q.trim()}%`;

    const leads = await db.query(`
      SELECT
        l.id, l.status, l.lead_type,
        c.first_name, c.last_name, c.email, c.phone, c.source
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE
        c.first_name ILIKE $1 OR
        c.last_name  ILIKE $1 OR
        c.email      ILIKE $1 OR
        c.phone      ILIKE $1 OR
        (c.first_name || ' ' || c.last_name) ILIKE $1
      ORDER BY
        CASE WHEN l.status NOT IN ('closed_won','closed_lost') THEN 0 ELSE 1 END,
        c.last_name ASC
      LIMIT 8
    `, [term]);

    res.json({ leads: leads.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
