-- Add an honest terminal state for missed official windows. The existing
-- database opener snapshots the old database and verifies every child FK.
CREATE TABLE tournaments_refined (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 starts_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ANNOUNCED','REGISTRATION','UPCOMING','ACTIVE','COMPLETED','CANCELLED')),
 bracket_json TEXT NOT NULL,
 metadata_json TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 kind TEXT NOT NULL DEFAULT 'legacy',
 season_id TEXT,
 deleted_at INTEGER
);
INSERT INTO tournaments_refined SELECT id,user_id,name,starts_at,status,bracket_json,metadata_json,created_at,updated_at,kind,season_id,deleted_at FROM tournaments;
DROP TABLE tournaments;
ALTER TABLE tournaments_refined RENAME TO tournaments;
CREATE UNIQUE INDEX official_tournament_schedule ON tournaments(user_id,season_id,starts_at) WHERE kind='official';
CREATE INDEX tournaments_visible ON tournaments(user_id,deleted_at,starts_at);
