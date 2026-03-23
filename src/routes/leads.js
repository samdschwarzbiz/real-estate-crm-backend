const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/leads  — list with filters
router.get('/', async (req, res) => {
  try {
    const {
      status,
      lead_type,
      search,
      sort = 'next_followup_asc',
      page = 1,
      limit = 25,
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status && status !== 'all') {
      conditions.push(`l.status = $${idx++}`);
      params.push(status);
    }
    if (lead_type && lead_type !== 'all') {
      conditions.push(`l.lead_type = $${idx++}`);
      params.push(lead_type);
    }
    if (search) {
      conditions.push(`(
        c.first_name ILIKE $${idx} OR
        c.last_name  ILIKE $${idx} OR
        c.email      ILIKE $${idx} OR
        c.phone      ILIKE $${idx}
      )`);
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const orderMap = {
      next_followup_asc:  'l.next_followup_at ASC NULLS LAST',
      next_followup_desc: 'l.next_followup_at DESC NULLS LAST',
      created_desc:       'l.created_at DESC',
      created_asc:        'l.created_at ASC',
      name_asc:           'c.last_name ASC, c.first_name ASC',
      price_desc:         'l.price_max DESC NULLS LAST',
    };
    const orderBy = orderMap[sort] || orderMap.next_followup_asc;

    const [rows, countResult] = await Promise.all([
      db.query(`
        SELECT
          l.*,
          c.first_name, c.last_name, c.email, c.phone, c.source,
          (SELECT COUNT(*) FROM activities a WHERE a.lead_id = l.id) AS activity_count,
          (SELECT COUNT(*) FROM tasks t WHERE t.lead_id = l.id AND t.completed = false) AS open_tasks
        FROM leads l
        JOIN contacts c ON c.id = l.contact_id
        ${where}
        ORDER BY ${orderBy}
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...params, parseInt(limit), offset]),
      db.query(`
        SELECT COUNT(*) FROM leads l
        JOIN contacts c ON c.id = l.contact_id
        ${where}
      `, params),
    ]);

    res.json({
      leads: rows.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      pages: Math.ceil(parseInt(countResult.rows[0].count) / parseInt(limit)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [lead, activities, tasks] = await Promise.all([
      db.query(`
        SELECT l.*, c.first_name, c.last_name, c.email, c.phone, c.phone2,
               c.address, c.city AS contact_city, c.state AS contact_state,
               c.zip AS contact_zip, c.source, c.notes AS contact_notes
        FROM leads l
        JOIN contacts c ON c.id = l.contact_id
        WHERE l.id = $1
      `, [id]),
      db.query(`
        SELECT * FROM activities
        WHERE lead_id = $1
        ORDER BY created_at DESC
      `, [id]),
      db.query(`
        SELECT * FROM tasks
        WHERE lead_id = $1
        ORDER BY completed ASC, due_date ASC NULLS LAST
      `, [id]),
    ]);

    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });

    res.json({
      lead: lead.rows[0],
      activities: activities.rows,
      tasks: tasks.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads  — create contact + lead together
router.post('/', async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const {
      // Contact fields
      first_name, last_name, email, phone, phone2, source,
      // Lead fields
      status = 'new', lead_type = 'buyer',
      price_min, price_max, beds_min, baths_min, preferred_areas,
      property_types, timeline, motivation, pre_approved,
      pre_approval_amount, pre_approval_lender,
      property_address, property_city, property_state, property_zip, estimated_value,
      next_followup_at, assigned_to, notes,
      // Past client fields
      closing_date, closing_address, closing_price,
    } = req.body;

    const contactResult = await client.query(`
      INSERT INTO contacts (first_name, last_name, email, phone, phone2, source, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [first_name, last_name, email || null, phone || null, phone2 || null, source || null, notes || null]);

    const contact_id = contactResult.rows[0].id;

    const leadResult = await client.query(`
      INSERT INTO leads (
        contact_id, status, lead_type,
        price_min, price_max, beds_min, baths_min, preferred_areas, property_types,
        timeline, motivation, pre_approved, pre_approval_amount, pre_approval_lender,
        property_address, property_city, property_state, property_zip, estimated_value,
        next_followup_at, assigned_to, last_contact_at,
        closing_date, closing_address, closing_price,
        is_past_client, client_type
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),
        $22,$23,$24,
        $25,$26
      ) RETURNING *
    `, [
      contact_id, status, lead_type,
      price_min || null, price_max || null,
      beds_min || null, baths_min || null,
      preferred_areas || null,
      property_types ? JSON.stringify(property_types) : null,
      timeline || null, motivation || null,
      pre_approved || false,
      pre_approval_amount || null, pre_approval_lender || null,
      property_address || null, property_city || null,
      property_state || null, property_zip || null,
      estimated_value || null,
      next_followup_at || null, assigned_to || null,
      closing_date || null, closing_address || null, closing_price || null,
      status === 'closed_won', status === 'closed_won' ? 'past_client' : 'lead',
    ]);

    await client.query(`
      INSERT INTO activities (lead_id, contact_id, type, subject, notes)
      VALUES ($1, $2, 'note', 'Lead created', $3)
    `, [leadResult.rows[0].id, contact_id, `New ${lead_type} lead added. Source: ${source || 'unknown'}`]);

    await client.query('COMMIT');
    res.status(201).json(leadResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/leads/:id
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const allowed = [
      'status','lead_type','price_min','price_max','beds_min','baths_min',
      'preferred_areas','property_types','timeline','motivation','pre_approved',
      'pre_approval_amount','pre_approval_lender','property_address','property_city',
      'property_state','property_zip','estimated_value','next_followup_at',
      'last_contact_at','assigned_to',
      // Past client fields
      'closing_date','closing_address','closing_price','is_past_client','client_type',
      'relationship_score','tags',
      // Commission fields
      'sale_price','commission_rate','agent_split','tax_rate','gross_commission','agent_gross','tax_amount','net_income',
      // Transaction deadline fields
      'earnest_money_date','inspection_deadline','financing_deadline','appraisal_deadline','title_deadline','final_walkthrough_date',
      // Google Calendar event IDs
      'earnest_money_gcal_id','inspection_gcal_id','financing_gcal_id','appraisal_gcal_id','title_gcal_id','walkthrough_gcal_id','closing_gcal_id',
    ];
    const updates = Object.keys(fields).filter(k => allowed.includes(k));
    if (!updates.length) return res.status(400).json({ error: 'No valid fields to update' });

    const setClauses = updates.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = updates.map(k => fields[k]);

    const result = await db.query(
      `UPDATE leads SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Lead not found' });

    // Log status change
    if (fields.status) {
      const lead = result.rows[0];
      await db.query(`
        INSERT INTO activities (lead_id, contact_id, type, subject, notes)
        VALUES ($1, $2, 'status_change', 'Status updated', $3)
      `, [id, lead.contact_id, `Status changed to: ${fields.status}`]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM leads WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/leads/:id/sync-deadlines  — sync all deadlines to Google Calendar
router.post('/:id/sync-deadlines', async (req, res) => {
  try {
    const { id } = req.params;
    const lead = await db.query(`
      SELECT l.*, c.first_name, c.last_name
      FROM leads l
      LEFT JOIN contacts c ON c.id = l.contact_id
      WHERE l.id = $1
    `, [id]);

    if (!lead.rows.length) return res.status(404).json({ error: 'Lead not found' });
    const row = lead.rows[0];

    const { syncAppointmentToGoogle } = require('../services/google-calendar');
    const address = row.property_address || row.closing_address || 'Property';
    const clientName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Client';

    const DEADLINES = [
      { field: 'earnest_money_date',   gcalField: 'earnest_money_gcal_id',  emoji: '💰', label: 'Earnest Money Deposit',        hours: 9 },
      { field: 'inspection_deadline',  gcalField: 'inspection_gcal_id',     emoji: '🔍', label: 'Inspection Deadline',           hours: 9 },
      { field: 'financing_deadline',   gcalField: 'financing_gcal_id',      emoji: '🏦', label: 'Financing Contingency Deadline', hours: 9 },
      { field: 'appraisal_deadline',   gcalField: 'appraisal_gcal_id',      emoji: '📋', label: 'Appraisal Deadline',            hours: 9 },
      { field: 'title_deadline',       gcalField: 'title_gcal_id',          emoji: '📝', label: 'Title Commitment Deadline',     hours: 9 },
      { field: 'final_walkthrough_date', gcalField: 'walkthrough_gcal_id',  emoji: '🚪', label: 'Final Walk-Through',            hours: 10 },
      { field: 'closing_date',         gcalField: 'closing_gcal_id',        emoji: '🎉', label: 'Closing',                      hours: 10 },
    ];

    const updates = {};
    let synced = 0;

    for (const d of DEADLINES) {
      const dateVal = row[d.field];
      if (!dateVal) continue;

      try {
        // Build a date at specified hour
        const dateStr = typeof dateVal === 'string' ? dateVal.slice(0, 10) : dateVal.toISOString().slice(0, 10);
        const scheduledAt = new Date(`${dateStr}T${String(d.hours).padStart(2,'0')}:00:00`);

        const fakeAppt = {
          id: null,
          google_event_id: row[d.gcalField] || null,
          type: 'closing',
          title: `${d.emoji} ${d.label}: ${clientName}`,
          property_address: address,
          scheduled_at: scheduledAt.toISOString(),
          duration_min: 60,
          notes: `Transaction deadline for ${clientName} — ${address}`,
        };

        const eventId = await syncAppointmentToGoogle(fakeAppt);
        if (eventId) {
          updates[d.gcalField] = eventId;
          synced++;
        }
      } catch (gcalErr) {
        console.log(`Skipped ${d.label} sync:`, gcalErr.message);
      }
    }

    // Save gcal IDs back to lead
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = [id, ...Object.values(updates)];
      await db.query(`UPDATE leads SET ${setClauses} WHERE id = $1`, values);
    }

    res.json({ success: true, synced, updates });
  } catch (err) {
    console.error('[sync-deadlines]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
