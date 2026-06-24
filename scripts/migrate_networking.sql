-- Migration script for networking table

-- 1. Add new columns
ALTER TABLE networking ADD COLUMN how_can_i_help TEXT;
ALTER TABLE networking ADD COLUMN how_can_they_help TEXT;
ALTER TABLE networking ADD COLUMN birthday DATE;
ALTER TABLE networking ADD COLUMN cadence TEXT;
ALTER TABLE networking ADD COLUMN last_contact DATE;
ALTER TABLE networking ADD COLUMN next_contact DATE;

-- 2. Migrate existing data
UPDATE networking SET how_can_they_help = help;
UPDATE networking SET last_contact = CAST(NULLIF(reach_out, '') AS DATE);

-- 3. Drop old columns
ALTER TABLE networking DROP COLUMN company;
ALTER TABLE networking DROP COLUMN help;
ALTER TABLE networking DROP COLUMN opportunity;
ALTER TABLE networking DROP COLUMN industry;
ALTER TABLE networking DROP COLUMN tiktok;
ALTER TABLE networking DROP COLUMN fu;
ALTER TABLE networking DROP COLUMN fu_date;
ALTER TABLE networking DROP COLUMN reach_out;
