-- When the user first bought the 3-month programme. Maintenance is the plan
-- that follows the programme, so it stays locked until this is set: without
-- it anyone could start on 29,90 € and skip the path the price assumes.
ALTER TABLE billing ADD COLUMN program_at TEXT;
