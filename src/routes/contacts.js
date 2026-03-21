const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const { search, source, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx} OR phone ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (source && source !== 'all') {
      conditions.push(`source = $${idx++}`);
      params.push(source);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows, count] = await Promise.all([
      db.query(`SELECT * FROM contacts ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx+1}`, [...params, parseInt(limit), offset]),
      db.query(`SELECT COUNT(*) FROM contacts ${where}`, params),
    ]);

    res.json({ contacts: rows.rows, total: parseInt(count.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/contacts/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*,
        (SELECT json_agg(l ORDER BY l.created_at DESC) FROM leads l WHERE l.contact_id = c.id) AS leads
      FROM contacts c WHERE c.id = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/contacts/:id
router.patch('/:id', async (req, res) => {
  try {
    const allowed = ['first_name','last_name','email','phone','phone2','address','city','state','zip','source','notes','tags'];
    const updates = Object.keys(req.body).filter(k => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });
    const setClauses = updates.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const result = await db.query(
      `UPDATE contacts SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...updates.map(k => req.body[k])]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
