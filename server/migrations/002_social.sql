CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('bot','player')),
  type TEXT NOT NULL,
  event_id TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  source TEXT NOT NULL,
  UNIQUE(user_id,event_id,direction)
);
CREATE INDEX messages_user_time_idx ON messages(user_id,created_at DESC);
CREATE TABLE conversation_summaries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_message_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,bot_id)
);
CREATE TABLE structured_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  messaged_at INTEGER
);
CREATE INDEX structured_events_user_idx ON structured_events(user_id,created_at DESC);
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ANNOUNCED','REGISTRATION','UPCOMING','ACTIVE','COMPLETED')),
  bracket_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE tournament_participants (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  seed INTEGER,
  state TEXT NOT NULL,
  PRIMARY KEY(tournament_id,bot_id)
);
