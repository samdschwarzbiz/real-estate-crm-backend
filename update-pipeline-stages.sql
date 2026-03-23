-- Migrate old statuses to new pipeline stages
UPDATE leads SET status = 'needs_time' WHERE status IN ('new', 'nurturing');
UPDATE leads SET status = 'active' WHERE status IN ('contacted');
UPDATE leads SET status = 'super_active' WHERE status IN ('showing', 'offer');
-- under_contract, closed_won, closed_lost stay the same
