const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/properties
router.get('/', async (req, res) => {
  try {
    const { status, type } = req.query;
    let where = [];
    let params = [];
    let i = 1;

    if (status && status !== 'all') {
      where.push(`status = $${i++}`);
      params.push(status);
    }
    if (type && type !== 'all') {
      where.push(`property_type = $${i++}`);
      params.push(type);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM properties ${whereClause} ORDER BY created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/properties/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM properties WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/properties
router.post('/', async (req, res) => {
  try {
    const {
      mls_number, address, city, state, zip, price,
      bedrooms, bathrooms, sqft, lot_sqft, year_built,
      property_type, status, list_date, close_date,
      description, notes,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO properties
        (mls_number, address, city, state, zip, price,
         bedrooms, bathrooms, sqft, lot_sqft, year_built,
         property_type, status, list_date, close_date, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        mls_number || null, address, city || null, state || null, zip || null,
        price || null, bedrooms || null, bathrooms || null,
        sqft || null, lot_sqft || null, year_built || null,
        property_type || 'single_family', status || 'active',
        list_date || null, close_date || null, description || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/properties/:id
router.patch('/:id', async (req, res) => {
  try {
    const allowed = [
      'mls_number','address','city','state','zip','price',
      'bedrooms','bathrooms','sqft','lot_sqft','year_built',
      'property_type','status','list_date','close_date','description',
    ];
    const updates = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const result = await pool.query(
      `UPDATE properties SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/properties/:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM properties WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
