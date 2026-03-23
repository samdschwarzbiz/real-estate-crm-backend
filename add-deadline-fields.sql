ALTER TABLE leads ADD COLUMN IF NOT EXISTS earnest_money_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inspection_deadline DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS financing_deadline DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_deadline DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS title_deadline DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS final_walkthrough_date DATE;
-- closing_date already exists

-- Google Calendar event IDs for each deadline
ALTER TABLE leads ADD COLUMN IF NOT EXISTS earnest_money_gcal_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS inspection_gcal_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS financing_gcal_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appraisal_gcal_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS title_gcal_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS walkthrough_gcal_id VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS closing_gcal_id VARCHAR(255);
