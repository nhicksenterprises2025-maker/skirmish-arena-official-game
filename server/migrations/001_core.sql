CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  recovery_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  disabled_at INTEGER
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE worlds (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK(revision >= 1),
  schema_version INTEGER NOT NULL,
  save_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  season_start_at INTEGER NOT NULL,
  season_end_at INTEGER NOT NULL
);
CREATE TABLE world_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  save_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX world_backups_user_idx ON world_backups(user_id,revision);
CREATE TABLE bots (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  power INTEGER NOT NULL,
  power_rank INTEGER NOT NULL,
  playstyle TEXT NOT NULL,
  personality_json TEXT NOT NULL,
  form REAL NOT NULL,
  familiarity_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,bot_id)
);
CREATE TABLE bot_careers (
  user_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  PRIMARY KEY(user_id,bot_id),
  FOREIGN KEY(user_id,bot_id) REFERENCES bots(user_id,bot_id) ON DELETE CASCADE
);
CREATE TABLE bot_weapon_stats (
  user_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  weapon TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  PRIMARY KEY(user_id,bot_id,weapon),
  FOREIGN KEY(user_id,bot_id) REFERENCES bots(user_id,bot_id) ON DELETE CASCADE
);
CREATE TABLE user_career_stats (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stats_json TEXT NOT NULL
);
CREATE TABLE user_weapon_stats (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weapon TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  PRIMARY KEY(user_id,weapon)
);
CREATE TABLE seasons (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  winner_bot_id TEXT,
  finalized_at INTEGER,
  stats_json TEXT NOT NULL,
  PRIMARY KEY(user_id,number)
);
CREATE TABLE balance_patches (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patch_id TEXT NOT NULL,
  generation INTEGER,
  fingerprint TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  reason TEXT,
  data_json TEXT NOT NULL,
  PRIMARY KEY(user_id,patch_id)
);
CREATE TABLE weapon_patch_stats (
  user_id TEXT NOT NULL,
  patch_id TEXT NOT NULL,
  weapon TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  PRIMARY KEY(user_id,patch_id,weapon),
  FOREIGN KEY(user_id,patch_id) REFERENCES balance_patches(user_id,patch_id) ON DELETE CASCADE
);
CREATE TABLE game_versions (
  version TEXT PRIMARY KEY,
  published_at INTEGER NOT NULL,
  notes TEXT NOT NULL,
  package_sha256 TEXT,
  package_bytes INTEGER
);
CREATE TABLE save_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL,
  note TEXT NOT NULL
);
