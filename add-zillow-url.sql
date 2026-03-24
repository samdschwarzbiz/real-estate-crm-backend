-- Add zillow_url column to leads table for seller listing links
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zillow_url TEXT;
