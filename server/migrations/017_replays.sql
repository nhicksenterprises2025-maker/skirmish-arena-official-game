CREATE TABLE replay_records (
 id TEXT PRIMARY KEY, match_id TEXT NOT NULL UNIQUE, schema_version INTEGER NOT NULL,
 metadata_json TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0), sha256 TEXT NOT NULL,
 created_at INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('ready','missing'))
);
CREATE TABLE replay_access (
 replay_id TEXT NOT NULL REFERENCES replay_records(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
 PRIMARY KEY(replay_id,user_id)
);
CREATE INDEX replay_access_user ON replay_access(user_id,replay_id);
CREATE TABLE replay_captures (
 match_id TEXT PRIMARY KEY, id TEXT NOT NULL UNIQUE, bytes INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL
);
CREATE TABLE replay_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 budget_bytes INTEGER NOT NULL DEFAULT 268435456, max_count INTEGER NOT NULL DEFAULT 50,
 warning TEXT, updated_at INTEGER NOT NULL
);
