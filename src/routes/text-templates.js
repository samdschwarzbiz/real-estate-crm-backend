const express = require('express');
const router = express.Router();
const db = require('../db');

// Ensure table exists and seed defaults
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS text_templates (
      id serial PRIMARY KEY,
      title varchar(100) NOT NULL,
      body text NOT NULL,
      category varchar(50) DEFAULT 'general',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);

  const { rows } = await db.query('SELECT COUNT(*) FROM text_templates');
  if (parseInt(rows[0].count) === 0) {
    const defaults = [
      { title: 'Introduction', body: "Hi {first_name}! This is Sam with Dolan Real Estate. I wanted to reach out and introduce myself — I'd love to help you find your perfect home. When's a good time to chat? 😊", category: 'intro' },
      { title: 'Follow Up', body: "Hey {first_name}, just checking in! Have you had any more thoughts on your home search? I'm here whenever you're ready. 🏠", category: 'follow_up' },
      { title: 'Check In', body: "Hi {first_name}! Hope you're doing well. Just wanted to touch base and see if anything has changed with your home search. Let me know if I can help!", category: 'check_in' },
      { title: 'Showing', body: "Hi {first_name}! I found a property I think you'd love. Would you be available for a showing this week? I can work around your schedule!", category: 'showing' },
      { title: 'Under Contract', body: "Great news {first_name}! We're officially under contract 🎉 I'll keep you updated every step of the way to closing. Exciting times ahead!", category: 'under_contract' },
      { title: 'Closing', body: "Congratulations {first_name}! 🎉🏠 It was such a pleasure helping you find your new home. Wishing you all the best in this new chapter!", category: 'closing' },
      { title: 'Sphere Outreach', body: "Hi {first_name}! This is Sam Schwarz with Dolan Real Estate. I'm reaching out to friends and family first — do you know anyone looking to buy or sell? I'd love the chance to help!", category: 'sphere' },
      { title: 'Price Drop Alert', body: "Hi {first_name}! A property just dropped in price that matches what you're looking for. Want me to send you the details? 🏡", category: 'price_drop' },
      { title: 'New Listing Alert', body: "Hi {first_name}! A new listing just hit the market that I think you'll love. Can I send you the details?", category: 'new_listing' },
      { title: 'Past Client Check-In', body: "Hey {first_name}! 👋 Just thinking about you and hoping you're loving your home. If you ever need anything — or know someone looking to buy or sell — I'm always here!", category: 'past_client' },
    ];
    for (const t of defaults) {
      await db.query(
        'INSERT INTO text_templates (title, body, category) VALUES ($1, $2, $3)',
        [t.title, t.body, t.category]
      );
    }
  }
}

ensureTable().catch(err => console.error('text_templates init error:', err.message));

// GET /api/text-templates
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM text_templates ORDER BY category, created_at');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/text-templates
router.post('/', async (req, res) => {
  try {
    const { title, body, category } = req.body;
    if (!title || !body) return res.status(400).json({ error: 'title and body required' });
    const result = await db.query(
      'INSERT INTO text_templates (title, body, category) VALUES ($1, $2, $3) RETURNING *',
      [title, body, category || 'general']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/text-templates/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['title', 'body', 'category'];
    const fields = req.body;
    const updates = Object.keys(fields).filter(k => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

    const setClauses = updates.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = updates.map(k => fields[k]);

    const result = await db.query(
      `UPDATE text_templates SET ${setClauses}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Template not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/text-templates/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM text_templates WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
