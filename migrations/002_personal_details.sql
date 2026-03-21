-- Migration 002: Personal details, past clients, activity tracking

-- Add personal detail fields to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS birthday          DATE,
  ADD COLUMN IF NOT EXISTS spouse_name       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS children          TEXT,
  ADD COLUMN IF NOT EXISTS occupation        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS employer          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(20) DEFAULT 'phone',
  -- phone | email | text
  ADD COLUMN IF NOT EXISTS instagram         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS facebook          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS linkedin          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS how_we_met        TEXT,
  ADD COLUMN IF NOT EXISTS personal_notes    TEXT;

-- Add closing/relationship tracking to leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS closing_date      DATE,
  ADD COLUMN IF NOT EXISTS closing_address   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS closing_price     INTEGER,
  ADD COLUMN IF NOT EXISTS is_past_client    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_type       VARCHAR(20) DEFAULT 'lead',
  -- lead | past_client | vip | sphere
  ADD COLUMN IF NOT EXISTS relationship_score SMALLINT DEFAULT 0,
  -- 0-10 how strong the relationship is
  ADD COLUMN IF NOT EXISTS last_touchpoint   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags              TEXT[];

-- Auto-mark as past client when closed_won
CREATE OR REPLACE FUNCTION mark_past_client()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed_won' AND OLD.status != 'closed_won' THEN
    NEW.is_past_client = TRUE;
    NEW.client_type = 'past_client';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER leads_past_client
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION mark_past_client();

-- Reminders table (birthdays, anniversaries, custom)
CREATE TABLE IF NOT EXISTS reminders (
  id            SERIAL PRIMARY KEY,
  contact_id    INT REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id       INT REFERENCES leads(id) ON DELETE SET NULL,
  type          VARCHAR(50) NOT NULL,
  -- birthday | closing_anniversary | home_anniversary | custom
  title         VARCHAR(255) NOT NULL,
  reminder_date DATE NOT NULL,           -- the actual date (e.g. birthday)
  recurs_yearly BOOLEAN DEFAULT TRUE,
  notes         TEXT,
  days_before   SMALLINT DEFAULT 3,      -- alert X days before
  dismissed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminders_date_idx ON reminders(reminder_date);
CREATE INDEX IF NOT EXISTS reminders_contact_idx ON reminders(contact_id);
