-- Additive social layer: gameplay worlds, identities, careers and balance remain untouched.
ALTER TABLE messages ADD COLUMN subject TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN mood TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE messages ADD COLUMN category TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE messages ADD COLUMN wants_reply INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN certainty REAL;
ALTER TABLE messages ADD COLUMN generation_id TEXT;
CREATE INDEX messages_conversation_idx ON messages(user_id,bot_id,created_at DESC,id);
CREATE TABLE ai_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE bot_social_profiles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  personality_json TEXT NOT NULL,
  player_respect REAL NOT NULL DEFAULT 50,
  player_trust REAL NOT NULL DEFAULT 50,
  important_memories_json TEXT NOT NULL DEFAULT '[]',
  opinions_json TEXT NOT NULL DEFAULT '[]',
  state_json TEXT NOT NULL DEFAULT '{}',
  last_event_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,bot_id),
  FOREIGN KEY(user_id,bot_id) REFERENCES bots(user_id,bot_id) ON DELETE CASCADE
);
CREATE TABLE bot_relationships (
  user_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  other_bot_id TEXT NOT NULL,
  friendship REAL NOT NULL DEFAULT 0,
  rivalry REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id,bot_id,other_bot_id),
  FOREIGN KEY(user_id,bot_id) REFERENCES bots(user_id,bot_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,other_bot_id) REFERENCES bots(user_id,bot_id) ON DELETE CASCADE
);
CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  event_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('event','lab','test')),
  priority INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  request_json TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(user_id,event_id)
);
CREATE INDEX ai_jobs_pending_idx ON ai_jobs(status,priority,next_attempt_at,created_at);
CREATE TABLE ai_generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES ai_jobs(id) ON DELETE CASCADE,
  bot_id TEXT NOT NULL,
  bot_name TEXT NOT NULL,
  context_json TEXT NOT NULL,
  prompt_json TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  validated_json TEXT,
  model TEXT NOT NULL,
  model_version TEXT,
  game_version TEXT NOT NULL,
  balance_patch_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE ai_training_feedback (
  generation_id TEXT PRIMARY KEY REFERENCES ai_generations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK(rating IN ('GOOD','BAD','EDIT')),
  corrected_output_json TEXT,
  updated_at INTEGER NOT NULL
);
