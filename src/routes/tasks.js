const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/tasks  — list tasks (optional ?lead_id= or ?due_today=true)
router.get('/', async (req, res) => {
  try {
    const { lead_id, due_today } = req.query;
    const conditions = ['t.completed = false'];
    const params = [];
    let idx = 1;

    if (lead_id) {
      conditions.push(`t.lead_id = $${idx++}`);
      params.push(lead_id);
    }
    if (due_today === 'true') {
      conditions.push(`t.due_date::date = CURRENT_DATE`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db.query(`
      SELECT t.*, c.first_name, c.last_name
      FROM tasks t
      LEFT JOIN contacts c ON c.id = t.contact_id
      ${where}
      ORDER BY
        CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
        t.due_date ASC NULLS LAST,
        t.created_at DESC
      LIMIT 50
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks  — create a task
router.post('/', async (req, res) => {
  try {
    const { lead_id, contact_id, title, notes, due_date, type, priority } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    const result = await db.query(`
      INSERT INTO tasks (lead_id, contact_id, title, notes, due_date, type, priority, completed)
      VALUES ($1, $2, $3, $4, $5, $6, $7, false)
      RETURNING *
    `, [
      lead_id || null,
      contact_id || null,
      title,
      notes || null,
      due_date || null,
      type || null,
      priority || 'normal',
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id  — update a task (complete, edit title, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['title', 'notes', 'due_date', 'priority', 'completed', 'type'];
    const fields = req.body;
    const updates = Object.keys(fields).filter(k => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

    // Handle completed_at
    let extra = '';
    if (fields.completed === true) extra = ', completed_at = NOW()';
    if (fields.completed === false) extra = ', completed_at = NULL';

    const setClauses = updates.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = updates.map(k => fields[k]);

    const result = await db.query(
      `UPDATE tasks SET ${setClauses}${extra} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
