require('dotenv').config();
const { pool } = require('./db');

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding database...');

    // Contacts
    const contacts = await client.query(`
      INSERT INTO contacts (first_name, last_name, email, phone, source, notes) VALUES
        ('Michael', 'Thompson', 'michael.t@email.com', '(602) 555-0191', 'zillow', 'Referred by Dave Wilson. Very motivated.'),
        ('Sarah', 'Johnson', 'sarah.j@gmail.com', '(602) 555-0342', 'referral', 'Referred by past client Karen Lee.'),
        ('David', 'Martinez', 'davidm@outlook.com', '(480) 555-0577', 'open_house', 'Met at Camelback Ridge open house.'),
        ('Emily', 'Chen', 'emily.chen@work.com', '(602) 555-0814', 'website', 'Filled out contact form on website.'),
        ('Robert', 'Williams', 'rwilliams@email.com', '(480) 555-0263', 'sign_call', 'Called from yard sign on Arcadia listing.'),
        ('Jennifer', 'Davis', 'jdavis@gmail.com', '(602) 555-0935', 'social_media', 'DM from Instagram post.'),
        ('James', 'Anderson', 'j.anderson@corp.com', '(480) 555-0748', 'referral', 'Referred by lender Mike at Chase.'),
        ('Lisa', 'Brown', 'lisa.brown@email.com', '(602) 555-0156', 'past_client', 'Bought with me 4 years ago, now selling.'),
        ('Kevin', 'Wilson', 'kwilson@hotmail.com', '(480) 555-0423', 'zillow', 'Zillow Premier Agent lead.'),
        ('Amanda', 'Taylor', 'amanda.t@gmail.com', '(602) 555-0681', 'realtor_com', 'Realtor.com inquiry on 123 Main St.')
      RETURNING id
    `);

    const cids = contacts.rows.map(r => r.id);

    // Leads
    await client.query(`
      INSERT INTO leads (
        contact_id, status, lead_type, price_min, price_max, beds_min, baths_min,
        preferred_areas, timeline, pre_approved, pre_approval_amount,
        last_contact_at, next_followup_at, motivation
      ) VALUES
        ($1,  'showing',       'buyer',  550000, 750000, 3, 2,   'Scottsdale, Paradise Valley',   'asap',    true,  700000, NOW() - INTERVAL '2 days',  NOW() + INTERVAL '1 day',   'Relocating from Chicago for new job starting July'),
        ($2,  'nurturing',     'buyer',  400000, 550000, 3, 2,   'Chandler, Gilbert',             '3_6mo',   true,  520000, NOW() - INTERVAL '5 days',  NOW() + INTERVAL '3 days',  'Growing family, needs more space'),
        ($3,  'contacted',     'buyer',  300000, 450000, 2, 2,   'Tempe, Mesa',                   '6_12mo',  false, null,   NOW() - INTERVAL '1 day',   NOW() + INTERVAL '5 days',  'First-time buyer, just starting to look'),
        ($4,  'offer',         'buyer',  800000, 1100000, 4, 3,  'Arcadia, Biltmore',             'asap',    true,  1050000,NOW() - INTERVAL '1 day',   NOW() + INTERVAL '1 day',   'Cash-strong buyer, very picky neighborhood'),
        ($5,  'new',           'seller', null,   null,   null,null,null,                           '1_3mo',   false, null,   NOW() - INTERVAL '3 days',  NOW() + INTERVAL '2 days',  'Downsizing after kids moved out'),
        ($6,  'nurturing',     'both',   500000, 700000, 3, 2,   'North Scottsdale',              '3_6mo',   true,  680000, NOW() - INTERVAL '7 days',  NOW() + INTERVAL '4 days',  'Selling current home to buy larger'),
        ($7,  'under_contract','buyer',  650000, 900000, 4, 3,   'Ahwatukee, South Mountain',     'asap',    true,  875000, NOW() - INTERVAL '1 day',   NOW() + INTERVAL '14 days', 'Under contract on 4520 E Camelback'),
        ($8,  'showing',       'seller', null,   null,   null,null,'Arcadia',                      'asap',    false, null,   NOW(),                      NOW() + INTERVAL '2 days',  'Divorce, needs to sell quickly'),
        ($9,  'new',           'buyer',  250000, 380000, 2, 1,   'Phoenix, Glendale',             '6_12mo',  false, null,   NOW() - INTERVAL '4 days',  NOW() + INTERVAL '3 days',  'Investor looking for rental property'),
        ($10, 'contacted',     'buyer',  450000, 600000, 3, 2,   'Scottsdale, Fountain Hills',    '1_3mo',   true,  575000, NOW() - INTERVAL '2 days',  NOW() + INTERVAL '2 days',  'Recently divorced, fresh start')
    `, cids);

    // Get lead ids
    const leads = await client.query('SELECT id FROM leads ORDER BY id LIMIT 10');
    const lids = leads.rows.map(r => r.id);

    // Activities
    await client.query(`
      INSERT INTO activities (lead_id, contact_id, type, subject, notes, created_at) VALUES
        ($1,  $11, 'call',     'Initial consultation call',      'Discussed needs and timeline. Very motivated buyer.', NOW() - INTERVAL '5 days'),
        ($1,  $11, 'showing',  'Showings in Scottsdale',         'Showed 3 homes on Via de Ventura. Liked 2 of them.', NOW() - INTERVAL '2 days'),
        ($2,  $12, 'email',    'Listing alert sent',             'Sent 5 new listings matching criteria.', NOW() - INTERVAL '7 days'),
        ($2,  $12, 'call',     'Follow-up call',                 'Interested in seeing Gilbert listings. Setting up showing.', NOW() - INTERVAL '5 days'),
        ($3,  $13, 'text',     'Introduction text',              'Introduced myself and offered to set up search.', NOW() - INTERVAL '1 day'),
        ($4,  $14, 'showing',  'Arcadia tour',                   'Toured 4 homes in Arcadia. Offer pending on 5432 N 44th St.', NOW() - INTERVAL '1 day'),
        ($5,  $15, 'call',     'Listing presentation prep call', 'Discussed current market, pricing strategy.', NOW() - INTERVAL '3 days'),
        ($7,  $17, 'note',     'Under contract',                 'Accepted at $875,000. Inspection scheduled for Monday.', NOW() - INTERVAL '1 day'),
        ($8,  $18, 'meeting',  'Listing appointment',            'Met at property. CMA done. Listing at $775,000.', NOW()),
        ($1,  $11, 'email',    'Market analysis sent',           'Sent CMA for comparable properties in their search area.', NOW() - INTERVAL '3 days')
    `, [...lids, ...cids]);

    // Tasks
    await client.query(`
      INSERT INTO tasks (lead_id, contact_id, title, type, priority, due_date) VALUES
        ($1,  $11, 'Schedule second round of showings',   'showing', 'high',   NOW() + INTERVAL '1 day'),
        ($2,  $12, 'Send new Gilbert listing alerts',     'email',   'normal', NOW() + INTERVAL '3 days'),
        ($4,  $14, 'Follow up on offer status',           'call',    'urgent', NOW() + INTERVAL '1 day'),
        ($5,  $15, 'Prepare listing presentation CMA',    'meeting', 'high',   NOW() + INTERVAL '2 days'),
        ($7,  $17, 'Confirm inspection appointment',      'call',    'high',   NOW() + INTERVAL '1 day'),
        ($8,  $18, 'Send listing agreement for signature','email',   'urgent', NOW() + INTERVAL '1 day'),
        ($3,  $13, 'Send first-time buyer guide',         'email',   'normal', NOW() + INTERVAL '5 days'),
        ($6,  $16, 'Check in — home search update',       'call',    'normal', NOW() + INTERVAL '4 days')
    `, [...lids, ...cids]);

    // A closed transaction for GCI stats
    const propResult = await client.query(`
      INSERT INTO properties (address, city, state, zip, price, bedrooms, bathrooms, sqft, property_type, status, close_date)
      VALUES ('4520 E Camelback Rd', 'Phoenix', 'AZ', '85018', 875000, 4, 3, 2800, 'single_family', 'sold', CURRENT_DATE - INTERVAL '15 days')
      RETURNING id
    `);
    const propId = propResult.rows[0].id;

    await client.query(`
      INSERT INTO transactions (
        lead_id, property_id, transaction_type, status,
        contract_date, close_date, list_price, sale_price,
        commission_rate, commission_side, gci
      ) VALUES (
        $1, $2, 'buy', 'closed',
        CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '15 days',
        895000, 875000,
        0.03, 'buy', 26250.00
      )
    `, [lids[6], propId]);

    console.log('✅ Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
