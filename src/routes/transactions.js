const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/transactions
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status && status !== 'all') {
      conditions.push(`t.status = $${idx++}`);
      params.push(status);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await db.query(`
      SELECT t.*,
        c.first_name, c.last_name,
        p.address AS property_address, p.city, p.state
      FROM transactions t
      LEFT JOIN leads l ON l.id = t.lead_id
      LEFT JOIN contacts c ON c.id = l.contact_id
      LEFT JOIN properties p ON p.id = t.property_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...params, parseInt(limit), offset]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/transactions
router.post('/', async (req, res) => {
  try {
    const {
      lead_id, property_id, transaction_type = 'buy', status = 'active',
      contract_date, close_date, list_price, sale_price,
      commission_rate, commission_side, gci, notes, lender, loan_type,
    } = req.body;

    const result = await db.query(`
      INSERT INTO transactions (
        lead_id, property_id, transaction_type, status,
        contract_date, close_date, list_price, sale_price,
        commission_rate, commission_side, gci, notes, lender, loan_type
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      lead_id || null, property_id || null, transaction_type, status,
      contract_date || null, close_date || null, list_price || null, sale_price || null,
      commission_rate || null, commission_side || null, gci || null,
      notes || null, lender || null, loan_type || null,
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
