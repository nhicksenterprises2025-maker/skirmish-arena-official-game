-- Tombstones keep deleted custom events from reappearing after retries/restarts.
ALTER TABLE tournaments ADD COLUMN deleted_at INTEGER;
CREATE INDEX tournaments_visible ON tournaments(user_id,deleted_at,starts_at);
