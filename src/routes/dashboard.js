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
      underContract,
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
          WHEN 'needs_time' THEN 1
          WHEN 'active' THEN 2
          WHEN 'super_active' THEN 3
          WHEN 'under_contract' THEN 4
          WHEN 'closed_won' THEN 5
          ELSE 6
        END
      `),
      db.query(`
        SELECT COUNT(*) FROM transactions
        WHERE status = 'closed'
          AND close_date >= DATE_TRUNC('month', CURRENT_DATE)
      `),
      db.query(`
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(sale_price), 0) AS total_volume,
          COALESCE(SUM(net_income), 0) AS total_net,
          COALESCE(SUM(
            CASE
              WHEN net_income IS NOT NULL THEN net_income
              WHEN sale_price IS NOT NULL AND commission_rate IS NOT NULL AND agent_split IS NOT NULL AND tax_rate IS NOT NULL
              THEN sale_price * (commission_rate/100) * (agent_split/100) * (1 - tax_rate/100)
              ELSE 0
            END
          ), 0) AS projected_net
        FROM leads
        WHERE status = 'under_contract'
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
      underContract: {
        count: parseInt(underContract.rows[0].count),
        totalVolume: parseFloat(underContract.rows[0].total_volume),
        projectedNet: parseFloat(underContract.rows[0].projected_net),
      },
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

// GET /api/dashboard/yearly-stats?year=2025
router.get('/yearly-stats', async (req, res) => {
  try {
    const thisYear = new Date().getFullYear();
    const selectedYear = parseInt(req.query.year) || thisYear - 1;

    const [selectedStats, selectedDeals, thisYearStats] = await Promise.all([
      db.query(`
        SELECT
          COALESCE(SUM(closing_price), 0) AS total_volume,
          COALESCE(SUM(gross_commission), 0) AS total_gci,
          COALESCE(SUM(net_income), 0) AS total_net,
          COUNT(*) AS total_deals,
          COALESCE(AVG(closing_price), 0) AS avg_sale_price
        FROM leads
        WHERE status = 'closed_won'
          AND EXTRACT(YEAR FROM closing_date) = $1
      `, [selectedYear]),
      db.query(`
        SELECT l.id, l.closing_date, l.closing_address, l.closing_price,
               l.gross_commission, l.net_income, l.commission_rate, l.agent_split,
               c.first_name, c.last_name
        FROM leads l
        JOIN contacts c ON c.id = l.contact_id
        WHERE l.status = 'closed_won'
          AND EXTRACT(YEAR FROM l.closing_date) = $1
        ORDER BY l.closing_date DESC
      `, [selectedYear]),
      db.query(`
        SELECT
          COALESCE(SUM(closing_price), 0) AS total_volume,
          COALESCE(SUM(gross_commission), 0) AS total_gci,
          COUNT(*) AS total_deals
        FROM leads
        WHERE status = 'closed_won'
          AND EXTRACT(YEAR FROM closing_date) = $1
      `, [thisYear]),
    ]);

    const s = selectedStats.rows[0];
    const ty = thisYearStats.rows[0];
    res.json({
      selectedYear,
      thisYear,
      selected: {
        year: selectedYear,
        gci: parseFloat(s.total_gci),
        volume: parseFloat(s.total_volume),
        net: parseFloat(s.total_net),
        deals: parseInt(s.total_deals),
        avgSalePrice: parseFloat(s.avg_sale_price),
        deals_list: selectedDeals.rows,
      },
      current: {
        year: thisYear,
        gci: parseFloat(ty.total_gci),
        volume: parseFloat(ty.total_volume),
        deals: parseInt(ty.total_deals),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/under-contract-leads
router.get('/under-contract-leads', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l.id, l.closing_address, l.closing_date, l.closing_price,
        l.net_income, l.commission_rate, l.agent_split, l.tax_rate,
        l.gross_commission,
        COALESCE(l.net_income,
          CASE
            WHEN l.closing_price IS NOT NULL AND l.commission_rate IS NOT NULL
              AND l.agent_split IS NOT NULL AND l.tax_rate IS NOT NULL
            THEN l.closing_price * (l.commission_rate/100) * (l.agent_split/100) * (1 - l.tax_rate/100)
            ELSE NULL
          END
        ) AS projected_net,
        c.first_name, c.last_name
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE l.status = 'under_contract'
      ORDER BY l.closing_date ASC NULLS LAST
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function statusLabel(status) {
  const labels = {
    needs_time: 'Needs Time',
    active: 'Active',
    super_active: 'Super Active',
    under_contract: 'Under Contract',
    closed_won: 'Closed',
    closed_lost: 'Lost',
  };
  return labels[status] || status;
}

// GET /api/dashboard/hot-leads  — leads needing attention
router.get('/hot-leads', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        l.id, l.status, l.next_followup_at, l.last_contact_at,
        c.first_name, c.last_name, c.phone, c.email
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE l.status NOT IN ('closed_won', 'closed_lost')
        AND (
          (l.next_followup_at IS NOT NULL AND l.next_followup_at < NOW())
          OR (l.last_contact_at IS NULL)
          OR (l.last_contact_at < NOW() - INTERVAL '14 days')
        )
      ORDER BY
        CASE WHEN l.next_followup_at IS NOT NULL AND l.next_followup_at < NOW() THEN 0
             WHEN l.last_contact_at IS NULL THEN 1
             ELSE 2 END ASC,
        l.next_followup_at ASC NULLS LAST
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/source-stats?status=closed_won  — lead counts by source (optional status filter)
router.get('/source-stats', async (req, res) => {
  try {
    const { status } = req.query;
    const whereClause = status
      ? `WHERE l.status = '${status.replace(/'/g,"''")}'`
      : `WHERE l.status NOT IN ('closed_lost')`;

    const result = await db.query(`
      SELECT
        COALESCE(c.source, 'unknown') AS source,
        COUNT(*) AS count
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      ${whereClause}
      GROUP BY c.source
      ORDER BY count DESC
    `);
    res.json(result.rows.map(r => ({
      source: r.source,
      count: parseInt(r.count),
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/monthly-income?year=2025&month=3
router.get('/monthly-income', async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const [summary, deals] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) AS total_deals,
          COALESCE(SUM(closing_price), 0) AS total_volume,
          COALESCE(SUM(gross_commission), 0) AS total_gci,
          COALESCE(SUM(net_income), 0) AS total_net,
          COALESCE(AVG(closing_price), 0) AS avg_price
        FROM leads
        WHERE status = 'closed_won'
          AND EXTRACT(YEAR  FROM closing_date) = $1
          AND EXTRACT(MONTH FROM closing_date) = $2
      `, [year, month]),
      db.query(`
        SELECT l.id, l.closing_date, l.closing_address, l.closing_price,
               l.gross_commission, l.net_income, l.commission_rate, l.agent_split,
               c.first_name, c.last_name
        FROM leads l
        JOIN contacts c ON c.id = l.contact_id
        WHERE l.status = 'closed_won'
          AND EXTRACT(YEAR  FROM l.closing_date) = $1
          AND EXTRACT(MONTH FROM l.closing_date) = $2
        ORDER BY l.closing_date DESC
      `, [year, month]),
    ]);

    const s = summary.rows[0];
    res.json({
      year, month,
      totalDeals:  parseInt(s.total_deals),
      totalVolume: parseFloat(s.total_volume),
      totalGCI:    parseFloat(s.total_gci),
      totalNet:    parseFloat(s.total_net),
      avgPrice:    parseFloat(s.avg_price),
      deals:       deals.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
