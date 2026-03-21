-- Real Estate CRM Database Schema
-- Phase 1 MVP

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contacts (
  id          SERIAL PRIMARY KEY,
  first_name  VARCHAR(100) NOT NULL,
  last_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(25),
  phone2      VARCHAR(25),
  address     VARCHAR(255),
  city        VARCHAR(100),
  state       VARCHAR(2),
  zip         VARCHAR(10),
  source      VARCHAR(60),   -- zillow, realtor_com, referral, open_house, social_media, cold_call, sign_call, website, past_client, other
  notes       TEXT,
  tags        TEXT[],
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_email_idx  ON contacts(email);
CREATE INDEX IF NOT EXISTS contacts_phone_idx  ON contacts(phone);
CREATE INDEX IF NOT EXISTS contacts_source_idx ON contacts(source);

-- ============================================================
-- LEADS
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                  SERIAL PRIMARY KEY,
  contact_id          INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  -- Pipeline status
  status              VARCHAR(50)  NOT NULL DEFAULT 'new',
  -- new | contacted | nurturing | showing | offer | under_contract | closed_won | closed_lost

  lead_type           VARCHAR(20)  NOT NULL DEFAULT 'buyer',
  -- buyer | seller | both | investor | renter

  -- Buyer preferences
  price_min           INTEGER,
  price_max           INTEGER,
  beds_min            SMALLINT,
  baths_min           NUMERIC(3,1),
  sqft_min            INTEGER,
  preferred_areas     TEXT,
  property_types      TEXT[],      -- single_family, condo, townhouse, multi_family, land

  -- Seller details
  property_address    VARCHAR(255),
  property_city       VARCHAR(100),
  property_state      VARCHAR(2),
  property_zip        VARCHAR(10),
  estimated_value     INTEGER,
  list_date_target    DATE,

  -- Qualification
  timeline            VARCHAR(50),
  -- asap | 1_3mo | 3_6mo | 6_12mo | 12plus_mo | just_looking
  motivation          TEXT,
  pre_approved        BOOLEAN      DEFAULT FALSE,
  pre_approval_amount INTEGER,
  pre_approval_lender VARCHAR(100),

  -- Tracking
  last_contact_at     TIMESTAMPTZ,
  next_followup_at    TIMESTAMPTZ,
  assigned_to         VARCHAR(100),
  referral_source     VARCHAR(255),

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_contact_id_idx      ON leads(contact_id);
CREATE INDEX IF NOT EXISTS leads_status_idx          ON leads(status);
CREATE INDEX IF NOT EXISTS leads_next_followup_idx   ON leads(next_followup_at);
CREATE INDEX IF NOT EXISTS leads_created_at_idx      ON leads(created_at);

-- ============================================================
-- ACTIVITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  lead_id     INT REFERENCES leads(id) ON DELETE CASCADE,
  contact_id  INT REFERENCES contacts(id) ON DELETE CASCADE,
  type        VARCHAR(50) NOT NULL,
  -- call | email | text | showing | open_house | meeting | offer_submitted | offer_accepted
  -- contract_signed | note | price_change | status_change
  subject     VARCHAR(255),
  notes       TEXT,
  duration_min SMALLINT,
  outcome     VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activities_lead_id_idx    ON activities(lead_id);
CREATE INDEX IF NOT EXISTS activities_contact_id_idx ON activities(contact_id);
CREATE INDEX IF NOT EXISTS activities_created_at_idx ON activities(created_at DESC);

-- ============================================================
-- PROPERTIES
-- ============================================================
CREATE TABLE IF NOT EXISTS properties (
  id              SERIAL PRIMARY KEY,
  mls_number      VARCHAR(50),
  address         VARCHAR(255) NOT NULL,
  city            VARCHAR(100),
  state           VARCHAR(2),
  zip             VARCHAR(10),
  county          VARCHAR(100),
  price           INTEGER,
  bedrooms        SMALLINT,
  bathrooms       NUMERIC(3,1),
  sqft            INTEGER,
  lot_sqft        INTEGER,
  year_built      SMALLINT,
  property_type   VARCHAR(50),   -- single_family | condo | townhouse | multi_family | land | commercial
  status          VARCHAR(50),   -- active | pending | sold | withdrawn | expired | off_market
  list_date       DATE,
  close_date      DATE,
  days_on_market  SMALLINT,
  description     TEXT,
  photo_urls      TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS properties_mls_idx    ON properties(mls_number);
CREATE INDEX IF NOT EXISTS properties_status_idx ON properties(status);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id               SERIAL PRIMARY KEY,
  lead_id          INT REFERENCES leads(id),
  property_id      INT REFERENCES properties(id),
  transaction_type VARCHAR(20) NOT NULL DEFAULT 'buy',  -- buy | sell | lease
  status           VARCHAR(50) NOT NULL DEFAULT 'active',
  -- active | under_contract | closed | fallen_through | withdrawn

  -- Dates
  contract_date    DATE,
  inspection_date  DATE,
  appraisal_date   DATE,
  close_date       DATE,
  possession_date  DATE,

  -- Financials
  list_price       INTEGER,
  sale_price       INTEGER,
  earnest_money    INTEGER,
  down_payment     INTEGER,
  loan_amount      INTEGER,
  commission_rate  NUMERIC(5,4),  -- e.g. 0.0300 = 3%
  commission_side  VARCHAR(10),   -- buy | sell | both
  gci              NUMERIC(12,2), -- gross commission income
  net_commission   NUMERIC(12,2),
  referral_fee     NUMERIC(12,2),

  -- Details
  closing_company  VARCHAR(100),
  lender           VARCHAR(100),
  loan_type        VARCHAR(50),   -- conventional | fha | va | cash | other
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_lead_id_idx    ON transactions(lead_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx     ON transactions(status);
CREATE INDEX IF NOT EXISTS transactions_close_date_idx ON transactions(close_date);

-- ============================================================
-- FOLLOW-UP TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  lead_id     INT REFERENCES leads(id) ON DELETE CASCADE,
  contact_id  INT REFERENCES contacts(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  notes       TEXT,
  due_date    TIMESTAMPTZ,
  type        VARCHAR(50),  -- call | email | text | showing | meeting | other
  priority    VARCHAR(20)   DEFAULT 'normal',  -- low | normal | high | urgent
  completed   BOOLEAN       NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_lead_id_idx  ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);
CREATE INDEX IF NOT EXISTS tasks_completed_idx ON tasks(completed);

-- ============================================================
-- updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
