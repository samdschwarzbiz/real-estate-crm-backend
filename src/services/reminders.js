const { Resend } = require('resend');
const pool = require('../db');

const resend = new Resend(process.env.RESEND_API_KEY);
const AGENT_EMAIL = process.env.AGENT_EMAIL || 'samdschwarz@gmail.com';
const FROM_EMAIL = 'onboarding@resend.dev'; // Free tier uses this sender

async function sendReminderEmail({ subject, html }) {
  if (!process.env.RESEND_API_KEY) return;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: AGENT_EMAIL,
      subject,
      html,
    });
    console.log(`✅ Reminder email sent: ${subject}`);
  } catch (err) {
    console.error('❌ Failed to send reminder email:', err.message);
  }
}

// ── Check birthdays (runs daily) ──────────────────────────
async function checkBirthdays() {
  try {
    const result = await pool.query(`
      SELECT c.first_name, c.last_name, c.birthday,
             DATE_PART('day',
               (DATE_TRUNC('year', CURRENT_DATE) +
                (birthday - DATE_TRUNC('year', birthday))) - CURRENT_DATE
             ) AS days_until
      FROM contacts c
      WHERE c.birthday IS NOT NULL
        AND (
          DATE_PART('month', c.birthday) = DATE_PART('month', CURRENT_DATE + INTERVAL '3 days')
          AND DATE_PART('day', c.birthday) = DATE_PART('day', CURRENT_DATE + INTERVAL '3 days')
        )
    `);

    for (const row of result.rows) {
      await sendReminderEmail({
        subject: `🎂 Birthday Reminder: ${row.first_name} ${row.last_name} in 3 days`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: #1a2b4a; color: white; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
              <h1 style="margin: 0; font-size: 24px;">🎂 Birthday Reminder</h1>
              <p style="margin: 8px 0 0; opacity: 0.8;">Dolan Real Estate CRM</p>
            </div>
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px;">
              <h2 style="color: #1a2b4a; margin-top: 0;">${row.first_name} ${row.last_name}'s birthday is in 3 days!</h2>
              <p style="color: #666;">Don't forget to reach out with a personal message. A quick text or call goes a long way in keeping your relationships strong.</p>
              <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-top: 16px;">
                <p style="margin: 0; font-size: 14px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Suggested Text</p>
                <p style="margin: 8px 0 0; color: #333;">"Hey ${row.first_name}! Just wanted to wish you an early Happy Birthday! Hope you have an amazing day! 🎉"</p>
              </div>
              <a href="https://frontend-tawny-rho-40.vercel.app" style="display: inline-block; margin-top: 20px; background: #c9a84c; color: #1a2b4a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open CRM</a>
            </div>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('Birthday check error:', err.message);
  }
}

// ── Check closing anniversaries (runs daily) ──────────────
async function checkAnniversaries() {
  try {
    const result = await pool.query(`
      SELECT c.first_name, c.last_name, l.closing_date, l.closing_address,
             DATE_PART('year', AGE(CURRENT_DATE, l.closing_date::date)) AS years_ago
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE l.closing_date IS NOT NULL
        AND DATE_PART('month', l.closing_date::date) = DATE_PART('month', CURRENT_DATE + INTERVAL '3 days')
        AND DATE_PART('day', l.closing_date::date) = DATE_PART('day', CURRENT_DATE + INTERVAL '3 days')
    `);

    for (const row of result.rows) {
      const years = Math.round(row.years_ago) + 1;
      const ordinal = years === 1 ? '1st' : years === 2 ? '2nd' : years === 3 ? '3rd' : `${years}th`;
      await sendReminderEmail({
        subject: `🏠 ${ordinal} Closing Anniversary: ${row.first_name} ${row.last_name} in 3 days`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <div style="background: #1a2b4a; color: white; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
              <h1 style="margin: 0; font-size: 24px;">🏠 Closing Anniversary</h1>
              <p style="margin: 8px 0 0; opacity: 0.8;">Dolan Real Estate CRM</p>
            </div>
            <div style="background: #f8f9fa; border-radius: 12px; padding: 24px;">
              <h2 style="color: #1a2b4a; margin-top: 0;">${row.first_name} ${row.last_name} — ${ordinal} Home Anniversary in 3 days!</h2>
              ${row.closing_address ? `<p style="color: #666;">📍 ${row.closing_address}</p>` : ''}
              <p style="color: #666;">Reach out to celebrate this milestone. Past clients who hear from their agent on their home anniversary are much more likely to refer you.</p>
              <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px; margin-top: 16px;">
                <p style="margin: 0; font-size: 14px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Suggested Text</p>
                <p style="margin: 8px 0 0; color: #333;">"Hey ${row.first_name}! Can you believe it's already been ${years} year${years > 1 ? 's' : ''} since we closed on your home?${row.closing_address ? ' ' + row.closing_address + '.' : ''} Hope you're still loving it! 🏠"</p>
              </div>
              <a href="https://frontend-tawny-rho-40.vercel.app" style="display: inline-block; margin-top: 20px; background: #c9a84c; color: #1a2b4a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open CRM</a>
            </div>
          </div>
        `,
      });
    }
  } catch (err) {
    console.error('Anniversary check error:', err.message);
  }
}

// ── Check follow-ups due today (runs daily at 8am) ────────
async function checkFollowUps() {
  try {
    const result = await pool.query(`
      SELECT c.first_name, c.last_name, c.phone, c.email,
             l.id AS lead_id, l.status, l.next_followup_at
      FROM leads l
      JOIN contacts c ON c.id = l.contact_id
      WHERE l.next_followup_at IS NOT NULL
        AND l.next_followup_at::date = CURRENT_DATE
        AND l.status NOT IN ('closed_won', 'closed_lost')
      ORDER BY l.next_followup_at ASC
    `);

    if (result.rows.length === 0) return;

    const leadRows = result.rows.map(row => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0;">
          <strong style="color: #1a2b4a;">${row.first_name} ${row.last_name}</strong>
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0; color: #666;">
          ${row.phone || row.email || '—'}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #f0f0f0;">
          <span style="background: #e8f4fd; color: #1a6dad; padding: 2px 8px; border-radius: 4px; font-size: 13px;">
            ${row.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        </td>
      </tr>
    `).join('');

    await sendReminderEmail({
      subject: `📅 ${result.rows.length} Follow-up${result.rows.length > 1 ? 's' : ''} Due Today`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: #1a2b4a; color: white; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px;">📅 Follow-ups Due Today</h1>
            <p style="margin: 8px 0 0; opacity: 0.8;">Dolan Real Estate CRM</p>
          </div>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px;">
            <p style="color: #666; margin-top: 0;">You have <strong>${result.rows.length}</strong> follow-up${result.rows.length > 1 ? 's' : ''} scheduled for today:</p>
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">Name</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">Contact</th>
                  <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase;">Status</th>
                </tr>
              </thead>
              <tbody>${leadRows}</tbody>
            </table>
            <a href="https://frontend-tawny-rho-40.vercel.app/leads" style="display: inline-block; margin-top: 20px; background: #c9a84c; color: #1a2b4a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Active Leads</a>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('Follow-up check error:', err.message);
  }
}

// ── Send a test email to confirm delivery ─────────────────
async function sendTestEmail() {
  await sendReminderEmail({
    subject: `✅ Dolan Real Estate CRM — Email Reminders Working!`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: #1a2b4a; color: white; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px;">✅ Email Reminders Active</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Dolan Real Estate CRM</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px;">
          <h2 style="color: #1a2b4a; margin-top: 0;">Your CRM email reminders are working!</h2>
          <p style="color: #666;">Every morning at 8am you'll receive reminders for:</p>
          <ul style="color: #666;">
            <li>📅 Follow-ups due today</li>
            <li>🎂 Birthdays coming up in 3 days</li>
            <li>🏠 Closing anniversaries coming up in 3 days</li>
          </ul>
          <a href="https://frontend-tawny-rho-40.vercel.app" style="display: inline-block; margin-top: 20px; background: #c9a84c; color: #1a2b4a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open CRM</a>
        </div>
      </div>
    `,
  });
}

async function checkAppointments() {
  try {
    const result = await pool.query(`
      SELECT a.*, c.first_name, c.last_name, c.phone
      FROM appointments a
      LEFT JOIN contacts c ON c.id = a.contact_id
      WHERE a.scheduled_at::date = CURRENT_DATE
        AND a.status = 'scheduled'
        AND a.reminder_sent = false
    `);

    if (result.rows.length === 0) return;

    const typeLabels = {
      showing: '🏠 Showing', walkthrough: '🚪 Final Walk-Through',
      inspection: '🔍 Inspection', closing: '🎉 Closing',
      open_house: '🏡 Open House', meeting: '📋 Meeting',
    };

    const rows = result.rows.map(r => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">
          <strong style="color:#1a2b4a;">${typeLabels[r.type] || r.type}</strong>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#666;">
          ${r.first_name ? r.first_name + ' ' + r.last_name : '—'}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#666;">
          ${r.property_address || r.title || '—'}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#666;">
          ${new Date(r.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
        </td>
      </tr>
    `).join('');

    await sendReminderEmail({
      subject: `📅 ${result.rows.length} Appointment${result.rows.length > 1 ? 's' : ''} Today`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <div style="background:#1a2b4a;color:white;border-radius:12px;padding:24px;margin-bottom:20px;">
            <h1 style="margin:0;font-size:24px;">📅 Today's Appointments</h1>
            <p style="margin:8px 0 0;opacity:0.8;">Dolan Real Estate CRM</p>
          </div>
          <div style="background:#f8f9fa;border-radius:12px;padding:24px;">
            <p style="color:#666;margin-top:0;">You have <strong>${result.rows.length}</strong> appointment${result.rows.length > 1 ? 's' : ''} today:</p>
            <table style="width:100%;border-collapse:collapse;background:white;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
              <thead>
                <tr style="background:#f5f5f5;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;">Type</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;">Client</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;">Address</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#888;text-transform:uppercase;">Time</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <a href="https://crm.samschwarzhomes.com/schedule" style="display:inline-block;margin-top:20px;background:#c9a84c;color:#1a2b4a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Schedule</a>
          </div>
        </div>
      `,
    });

    // Mark reminders as sent
    const ids = result.rows.map(r => r.id);
    await pool.query(`UPDATE appointments SET reminder_sent = true WHERE id = ANY($1)`, [ids]);
  } catch (err) {
    console.error('Appointment reminder error:', err.message);
  }
}

// ── Check upcoming closings (3 days out + 1 day out) ──────
async function checkUpcomingClosings() {
  try {
    for (const daysAhead of [3, 1]) {
      const result = await pool.query(`
        SELECT c.first_name, c.last_name, l.id AS lead_id,
               l.closing_date, l.closing_address, l.closing_price, l.net_income
        FROM leads l
        JOIN contacts c ON c.id = l.contact_id
        WHERE l.status = 'under_contract'
          AND l.closing_date IS NOT NULL
          AND l.closing_date::date = CURRENT_DATE + INTERVAL '${daysAhead} days'
      `);

      if (result.rows.length === 0) continue;

      for (const row of result.rows) {
        const dayLabel = daysAhead === 1 ? 'TOMORROW' : 'in 3 days';
        const closingDateStr = new Date(row.closing_date).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });
        await sendReminderEmail({
          subject: `🎉 Closing ${dayLabel}: ${row.first_name} ${row.last_name}${row.closing_address ? ' — ' + row.closing_address : ''}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <div style="background: #1a2b4a; color: white; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px;">🎉 Closing ${dayLabel.toUpperCase()}!</h1>
                <p style="margin: 8px 0 0; opacity: 0.8;">Dolan Real Estate CRM</p>
              </div>
              <div style="background: #f8f9fa; border-radius: 12px; padding: 24px;">
                <h2 style="color: #1a2b4a; margin-top: 0;">${row.first_name} ${row.last_name}</h2>
                ${row.closing_address ? `<p style="color: #444; font-size: 16px;">📍 ${row.closing_address}</p>` : ''}
                <p style="color: #666;">📅 Closing Date: <strong>${closingDateStr}</strong></p>
                ${row.closing_price ? `<p style="color: #666;">💰 Sale Price: <strong>$${Number(row.closing_price).toLocaleString()}</strong></p>` : ''}
                ${row.net_income ? `<p style="color: #16a34a; font-weight: 600;">✅ Net Income: $${Number(row.net_income).toLocaleString()}</p>` : ''}
                <a href="https://crm.dolanre.com/leads/${row.lead_id}" style="display: inline-block; margin-top: 20px; background: #c9a84c; color: #1a2b4a; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">View Deal →</a>
              </div>
            </div>
          `,
        });
      }
    }
  } catch (err) {
    console.error('Upcoming closings check error:', err.message);
  }
}

module.exports = { checkBirthdays, checkAnniversaries, checkFollowUps, sendTestEmail, checkAppointments, checkUpcomingClosings };
