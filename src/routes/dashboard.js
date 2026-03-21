const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      activeLeads,
      newThisWeek,
      followupsDueToday,
      gciThisMonth,
      gciThisYear,
      pipelineByStatus,
      closedThisMonth,
    ] = await Promise.all([
      db.query(`
        SELECT COUNT(*) FROM leads
        WHERE status NOT IN ('closed_won', 'closed_lost')
      `),
      db.query(`
        SELECT COUNT(*) FROM leads
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `),
      db.query(`
        SELECT COUNT(*) FROM tasks
        WHERE completed = false
          AND due_date <= NOW() + INTERVAL '1 day'
          AND due_date >= NOW() - INTERVAL '1 day'
      `),
      db.query(`
        SELECT COALESCE(SUM(gci), 0) AS total FROM transactions
        WHERE status = 'closed'
          AND close_date >= DATE_TRUNC('month', CURRENT_DATE)
          AND close_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      `),
      db.query(`
        SELECT COALESCE(SUM(gci), 0) AS total FROM transactions
        WHERE status = 'closed'
          AND close_date >= DATE_TRUNC('year', CURRENT_DATE)
      `),
      db.query(`
        SELECT status, COUNT(*) AS count FROM leads
        WHERE status NOT IN ('closed_lost')
        GROUP BY status
        ORDER BY CASE status
          WHEN 'new' THEN 1
          WHEN 'contacted' THEN 2
          WHEN 'nurturing' THEN 3
          WHEN 'showing' THEN 4
          WHEN 'offer' THEN 5
          WHEN 'under_contract' THEN 6
          WHEN 'closed_won' THEN 7
          ELSE 8
        END
      `),
      db.query(`
        SELECT COUNT(*) FROM transactions
        WHERE status = 'closed'
          AND close_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
    ]);

    res.json({
      activeLeads: parseInt(activeLeads.rows[0].count),
      newThisWeek: parseInt(newThisWeek.rows[0].count),
      followupsDueToday: parseInt(followupsDueToday.rows[0].count),
      gciThisMonth: parseFloat(gciThisMonth.rows[0].total),
      gciThisYear: parseFloat(gciThisYear.rows[0].total),
      closedThisMonth: parseInt(closedThisMonth.rows[0].count),
      pipelineByStatus: pipelineByStatus.rows.map(r => ({
        status: r.status,
        count: parseInt(r.count),
        label: statusLabel(r.status),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/recent-activity
router.get('/recent-activity', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        a.id,
        a.type,
        a.subject,
        a.notes,
        a.created_at,
        c.first_name,
        c.last_name,
        l.id AS lead_id,
        l.lead_type
      FROM activities a
      JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN leads l ON l.id = a.lead_id
      ORDER BY a.created_at DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/upcoming-tasks
router.get('/upcoming-tasks', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        t.id,
        t.title,
        t.type,
        t.priority,
        t.due_date,
        t.lead_id,
        c.first_name,
        c.last_name
      FROM tasks t
      JOIN contacts c ON c.id = t.contact_id
      WHERE t.completed = false
        AND t.due_date IS NOT NULL
      ORDER BY t.due_date ASC
      LIMIT 8
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/gci-trend  (last 6 months)
router.get('/gci-trend', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', close_date), 'Mon YY') AS month,
        DATE_TRUNC('month', close_date) AS month_date,
        COALESCE(SUM(gci), 0) AS gci,
        COUNT(*) AS deals
      FROM transactions
      WHERE status = 'closed'
        AND close_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
      GROUP BY DATE_TRUNC('month', close_date)
      ORDER BY month_date ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/upcoming-reminders  (birthdays & anniversaries in next 30 days)
router.get('/upcoming-reminders', async (req, res) => {
  try {
    // Closing anniversaries from leads (closed_won with a closing_date)
    const anniversaries = await db.query(`
      SELECT
        l.id AS lead_id,
        c.id AS contact_id,
        c.first_name,
        c.last_name,
        l.closing_date,
        l.closing_address,
        'closing_anniversary' AS type,
        -- days until next occurrence of the anniversary
        (
          DATE(
            DATE_TRUNC('year', CURRENT_DATE) +
            (closing_date - DATE_TRUNC('year', closing_date))
          ) +
          CASE
            WHEN (
              DATE_TRUNC('year', CURRENT_DATE) +
              (closing_date - DATE_TRUNC('year', closing_date))
            ) < CURRENT_DATE THEN INTERVAL '1 year'
            ELSE INTERVAL '0'
          END
        ) - CURRENT_DATE AS days_until
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE l.status = 'closed_won'
        AND l.closing_date IS NOT NULL
      ORDER BY days_until ASC
    `);

    // Birthdays from contacts that have a lead
    const birthdays = await db.query(`
      SELECT
        l.id AS lead_id,
        c.id AS contact_id,
        c.first_name,
        c.last_name,
        c.birthday,
        'birthday' AS type,
        (
          DATE(
            DATE_TRUNC('year', CURRENT_DATE) +
            (c.birthday - DATE_TRUNC('year', c.birthday))
          ) +
          CASE
            WHEN (
              DATE_TRUNC('year', CURRENT_DATE) +
              (c.birthday - DATE_TRUNC('year', c.birthday))
            ) < CURRENT_DATE THEN INTERVAL '1 year'
            ELSE INTERVAL '0'
          END
        ) - CURRENT_DATE AS days_until
      FROM contacts c
      LEFT JOIN leads l ON l.contact_id = c.id AND l.status NOT IN ('closed_lost')
      WHERE c.birthday IS NOT NULL
      ORDER BY days_until ASC
    `);

    const all = [
      ...anniversaries.rows.map(r => ({
        ...r,
        days_until: parseInt(r.days_until),
        date: r.closing_date,
      })),
      ...birthdays.rows.map(r => ({
        ...r,
        days_until: parseInt(r.days_until),
        date: r.birthday,
      })),
    ]
      .filter(r => r.days_until >= 0 && r.days_until <= 30)
      .sort((a, b) => a.days_until - b.days_until);

    res.json(all);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function statusLabel(status) {
  const labels = {
    new: 'New',
    contacted: 'Contacted',
    nurturing: 'Nurturing',
    showing: 'Showing',
    offer: 'Offer',
    under_contract: 'Under Contract',
    closed_won: 'Closed',
    closed_lost: 'Lost',
  };
  return labels[status] || status;
}

module.exports = router;
